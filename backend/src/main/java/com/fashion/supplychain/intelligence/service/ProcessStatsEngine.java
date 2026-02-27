package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceProcessStats;
import com.fashion.supplychain.intelligence.mapper.IntelligenceProcessStatsMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 工序统计引擎 — 智能预判的"学习大脑"
 *
 * <p><b>数据飞轮闭环：</b>
 * <pre>
 *   扫码数据 (t_scan_record)
 *       ↓  每日凌晨 aggregateFromScanRecord()
 *   工序耗时统计 (t_intelligence_process_stats)  ← sample_count 持续增长
 *       ↓  predictFinish() 查询
 *   预测结果返回前端  → 用户反馈实际完成时间
 *       ↓  FeedbackLearningOrchestrator 写入 deviation_minutes
 *   偏差数据累积，下一轮学习时被纳入样本修正
 * </pre>
 *
 * <p><b>置信度示例（公式：min(0.92, 0.35 + ln(n+1)×0.12)）：</b>
 * <ul>
 *   <li>2 个样本 → 0.44（新上线租户）</li>
 *   <li>10 个样本 → 0.64（约1个月数据）</li>
 *   <li>30 个样本 → 0.77（约3个月数据）</li>
 *   <li>80 个样本 → 0.88（约半年数据）</li>
 *   <li>150+ 个样本 → 0.92（上限）</li>
 * </ul>
 */
@Service
@Slf4j
public class ProcessStatsEngine {

    @Autowired
    private IntelligenceProcessStatsMapper statsMapper;

    // ─────────────────────────────────────────────────────────────────────────
    // 学习：从扫码记录重新计算统计
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 从过去 90 天的扫码记录重新计算指定租户的工序统计，并 upsert 到统计表。
     * 由 {@link com.fashion.supplychain.intelligence.job.IntelligenceLearningJob} 每日调用。
     *
     * @param tenantId 目标租户ID
     * @return 更新或新增的统计条目数
     */
    @Transactional(rollbackFor = Exception.class)
    public int recomputeForTenant(Long tenantId) {
        log.info("[智能学习] 开始计算租户 {} 工序统计...", tenantId);

        List<IntelligenceProcessStats> computed = statsMapper.aggregateFromScanRecord(tenantId);
        if (computed == null || computed.isEmpty()) {
            log.info("[智能学习] 租户 {} 暂无足够样本数据（需要≥2个订单，每订单≥2次扫码）", tenantId);
            return 0;
        }

        int upserted = 0;
        for (IntelligenceProcessStats stat : computed) {
            stat.setTenantId(tenantId);
            // 工序名标准化写入：确保统计表存的是标准名，不存变体
            stat.setStageName(normalizeStage(stat.getStageName()));
            stat.setConfidenceScore(computeConfidence(stat.getSampleCount()));
            stat.setLastComputedTime(LocalDateTime.now());

            // 按 (tenant_id, stage_name, scan_type) 唯一键 upsert
            LambdaQueryWrapper<IntelligenceProcessStats> wrapper =
                    new LambdaQueryWrapper<IntelligenceProcessStats>()
                            .eq(IntelligenceProcessStats::getTenantId, tenantId)
                            .eq(IntelligenceProcessStats::getStageName, stat.getStageName())
                            .eq(IntelligenceProcessStats::getScanType, stat.getScanType());

            IntelligenceProcessStats existing = statsMapper.selectOne(wrapper);
            if (existing != null) {
                stat.setId(existing.getId());
                statsMapper.updateById(stat);
            } else {
                statsMapper.insert(stat);
            }
            upserted++;
        }

        log.info("[智能学习] 租户 {} 完成，共更新/新增 {} 条工序统计", tenantId, upserted);
        return upserted;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 查询：供预测引擎使用
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 查询指定租户 + 阶段名称的最优统计记录（样本量最多的优先）。
     *
     * @param tenantId  租户ID（null时跨租户兜底查询）
     * @param stageName 工序阶段名（progress_stage）
     * @param scanType  扫码类型（null时不限制）
     * @return 统计记录，null 表示数据不足无法预测
     */
    public IntelligenceProcessStats findBestStats(Long tenantId, String stageName, String scanType) {
        // 工序名标准化：将“裁剪工序”→“裁剪”等变体合并，避免同一工序被记成多条统计导致样本被稀释
        String normalizedStage = normalizeStage(stageName);
        LambdaQueryWrapper<IntelligenceProcessStats> wrapper =
                new LambdaQueryWrapper<IntelligenceProcessStats>()
                        .eq(tenantId != null, IntelligenceProcessStats::getTenantId, tenantId)
                        .eq(StringUtils.hasText(normalizedStage), IntelligenceProcessStats::getStageName, normalizedStage)
                        .eq(StringUtils.hasText(scanType), IntelligenceProcessStats::getScanType, scanType)
                        .orderByDesc(IntelligenceProcessStats::getSampleCount);

        List<IntelligenceProcessStats> list = statsMapper.selectList(wrapper);
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 获取所有活跃租户ID（最近90天内有扫码记录），供学习Job批量遍历。
     */
    public List<Long> findActiveTenantIds() {
        return statsMapper.findActiveTenantIds();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 置信度计算
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 置信度公式：{@code min(0.92, 0.35 + ln(sampleCount+1) × 0.12)}
     * <ul>
     *   <li>初期少量样本：0.40～0.50（前端标注"仅供参考"）</li>
     *   <li>稳定积累后：0.80～0.92（前端标注"较高置信度"）</li>
     * </ul>
     */
    public BigDecimal computeConfidence(Integer sampleCount) {
        if (sampleCount == null || sampleCount <= 0) {
            return BigDecimal.valueOf(0.30);
        }
        double raw = 0.35 + Math.log(sampleCount + 1.0) * 0.12;
        double clamped = Math.min(0.92, raw);
        // 保留两位小数
        return BigDecimal.valueOf(Math.round(clamped * 100) / 100.0);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 工序名标准化
    // ───────────────────────────────────────────────────────────────────────────

    /**
     * 工序名标准化：将各种常见变体名称统一到标准名称
     *
     * <p>防止同一工序（如“裁剪”和“裁剪工序”）被隐分为两条统计记录导致样本稀释。
     * 同时应用于记录嵌入：每次计算统计时，stageName 先过这个方法。
     *
     * @param name 原始工序名称（可能包含“工序”后缀或其他形式）
     * @return 标准化后的工序名称
     */
    public static String normalizeStage(String name) {
        if (!StringUtils.hasText(name)) return name;
        String key = name.trim();
        return STAGE_ALIASES.getOrDefault(key, key);
    }

    /** 工序名映射表：字鞝尾缀/别名 → 标准名 */
    private static final java.util.Map<String, String> STAGE_ALIASES;
    static {
        java.util.Map<String, String> m = new java.util.HashMap<>();
        m.put("裁剪工序", "裁剪");   m.put("裁剪分菲", "裁剪");
        m.put("车缝工序", "车缝");   m.put("缝制工序", "车缝");   m.put("缝制", "车缝");
        m.put("尾部工序", "尾部");   m.put("尾部处理", "尾部");
        m.put("质检工序", "质检");   m.put("质检验收", "质检");   m.put("验收", "质检");
        m.put("入库工序", "入库");   m.put("成品入库", "入库");
        m.put("包装工序", "包装");   m.put("包装处理", "包装");
        m.put("二次工艺工序", "二次工艺");  m.put("后处理", "二次工艺");  m.put("印花水洗", "二次工艺");
        STAGE_ALIASES = java.util.Collections.unmodifiableMap(m);
    }
}
