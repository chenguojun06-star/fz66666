package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 长期记忆三层架构
 * <p>FACT(事实)、EPISODIC(过程)、REFLECTIVE(反思)。
 * <br>租户层 (TENANT) 仅自身可见；平台层 (PLATFORM_GLOBAL) 由超管沉淀的跨租户匿名经验。</p>
 */
@Slf4j
@Service
public class LongTermMemoryOrchestrator {

    @Autowired
    private AiLongMemoryMapper memoryMapper;

    /**
     * 写入租户级记忆（FACT/EPISODIC/REFLECTIVE）
     */
    public AiLongMemory writeTenantMemory(String layer, String subjectType, String subjectId,
                                          String subjectName, String content, String embeddingId,
                                          BigDecimal confidence, String sourceSessionId) {
        AiLongMemory m = baseRecord(layer, subjectType, subjectId, subjectName, content,
            embeddingId, confidence, sourceSessionId);
        m.setScope("TENANT");
        m.setTenantId(UserContext.tenantId());
        memoryMapper.insert(m);
        return m;
    }

    /**
     * 写入平台级匿名经验（仅超管可调用，需脱敏后传入）
     */
    public AiLongMemory writePlatformMemory(String layer, String subjectType, String content,
                                            String embeddingId, BigDecimal confidence) {
        AiLongMemory m = baseRecord(layer, subjectType, null, null, content, embeddingId,
            confidence, null);
        m.setScope("PLATFORM_GLOBAL");
        m.setTenantId(null);
        memoryMapper.insert(m);
        return m;
    }

    /**
     * 检索：当前租户记忆 + 平台全局经验（合并返回）。
     * P2: 时间衰减排序 — 新近记忆额外加权，防止陈旧高分记忆永久霸占列表。
     * 衰减系数：< 7天 × 1.30 | 7-30天 × 1.00 | 30-90天 × 0.85 | > 90天 × 0.70
     */
    public List<AiLongMemory> retrieve(String subjectType, String subjectId, int limit) {
        Long tid = UserContext.tenantId();
        // 多取一些候选，衰减后截断（最多 50 条候选）
        int fetchLimit = Math.min(Math.max(limit, 1) * 2, 50);
        LambdaQueryWrapper<AiLongMemory> w = new LambdaQueryWrapper<>();
        w.eq(subjectType != null, AiLongMemory::getSubjectType, subjectType)
         .eq(subjectId != null, AiLongMemory::getSubjectId, subjectId)
         .eq(AiLongMemory::getDeleteFlag, 0)
         .and(q -> q.eq(AiLongMemory::getScope, "PLATFORM_GLOBAL")
                    .or(o -> o.eq(AiLongMemory::getScope, "TENANT")
                              .eq(AiLongMemory::getTenantId, tid)))
         .orderByDesc(AiLongMemory::getConfidence)
         .last("LIMIT " + fetchLimit);

        List<AiLongMemory> mems = memoryMapper.selectList(w);

        // 按衰减后得分重排，取 top limit
        mems.sort(Comparator.comparingDouble(this::calcDecayedScore).reversed());
        return mems.size() > limit ? mems.subList(0, limit) : mems;
    }

    /**
     * 记忆有效得分 = confidence × 时间衰减系数
     * 新近（< 7 天）记忆获得加权，鼓励 AI 优先使用新知识。
     */
    private double calcDecayedScore(AiLongMemory m) {
        double base = m.getConfidence() != null ? m.getConfidence().doubleValue() : 60.0;
        if (m.getCreateTime() == null) return base;
        long daysOld = ChronoUnit.DAYS.between(m.getCreateTime(), LocalDateTime.now());
        double factor = daysOld < 7 ? 1.30 : daysOld < 30 ? 1.00 : daysOld < 90 ? 0.85 : 0.70;
        return base * factor;
    }

    public void incrementHit(Long id) {
        try {
            memoryMapper.incrementHit(id);
        } catch (Exception e) {
            log.warn("[Memory] 递增命中失败 id={} err={}", id, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // mem0 多信号检索（Upgrade 4：时间衰减 + BM25关键词 + 实体匹配）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 多信号融合检索 — 参考 mem0 思想的加权混合排序。
     *
     * <p><b>信号权重</b>：
     * <ul>
     *   <li>时间衰减（40%）— 与 {@link #retrieve} 相同的衰减因子</li>
     *   <li>BM25 关键词匹配（30%）— TF 近似，query 词在 content 中出现频率越高得分越高</li>
     *   <li>实体匹配（30%）— 从 query 中提取订单号、工厂名、金额等实体，命中实体的记忆优先</li>
     * </ul>
     *
     * <p><b>适用场景</b>：AI Agent 在处理复杂多跳问题时（如"帮我找上次那个红色款式的BOM"），
     * 纯时间衰减无法识别最相关记忆；多信号融合能显著提升检索精准度。
     *
     * @param query       用户查询文本
     * @param subjectType 主题类型过滤（null 则不过滤）
     * @param subjectId   主题 ID 过滤（null 则不过滤）
     * @param limit       最多返回条数
     */
    public List<AiLongMemory> retrieveMultiSignal(String query, String subjectType,
                                                   String subjectId, int limit) {
        Long tid = UserContext.tenantId();
        int fetchLimit = Math.min(Math.max(limit, 1) * 4, 100);

        LambdaQueryWrapper<AiLongMemory> w = new LambdaQueryWrapper<>();
        w.eq(StringUtils.hasText(subjectType), AiLongMemory::getSubjectType, subjectType)
         .eq(StringUtils.hasText(subjectId), AiLongMemory::getSubjectId, subjectId)
         .eq(AiLongMemory::getDeleteFlag, 0)
         .and(q -> q.eq(AiLongMemory::getScope, "PLATFORM_GLOBAL")
                    .or(o -> o.eq(AiLongMemory::getScope, "TENANT")
                              .eq(AiLongMemory::getTenantId, tid)))
         .last("LIMIT " + fetchLimit);

        List<AiLongMemory> candidates = memoryMapper.selectList(w);

        if (candidates.isEmpty()) return candidates;

        // 提取实体列表（订单号、工厂名、金额等）
        List<String> entities = extractEntities(query);

        // 多信号加权排序
        candidates.sort(Comparator.comparingDouble(
                m -> -calcMultiSignalScore(m, query, entities)));

        return candidates.size() > limit ? candidates.subList(0, limit) : candidates;
    }

    /**
     * 多信号综合评分：40% 时间衰减 + 30% BM25关键词 + 30% 实体命中
     */
    private double calcMultiSignalScore(AiLongMemory m, String query, List<String> entities) {
        double decayScore   = calcDecayedScore(m);                       // 0~130
        double keywordScore = calcKeywordScore(m, query) * 130.0;        // 0~130
        double entityScore  = calcEntityScore(m, entities) * 130.0;      // 0~130
        return decayScore * 0.40 + keywordScore * 0.30 + entityScore * 0.30;
    }

    /**
     * BM25 近似关键词得分（0.0~1.0）。
     * 将 query 按空格/标点切分，统计每个词在 content 中出现的次数（TF），
     * 归一化后返回。
     */
    private double calcKeywordScore(AiLongMemory m, String query) {
        if (!StringUtils.hasText(query) || !StringUtils.hasText(m.getContent())) return 0.0;
        String content = m.getContent().toLowerCase();
        String[] terms = query.toLowerCase().split("[\\s，。！？,.!?\\-_]+");
        if (terms.length == 0) return 0.0;
        int hits = 0;
        for (String term : terms) {
            if (term.length() < 2) continue;  // 忽略单字词（噪声大）
            int idx = 0;
            while ((idx = content.indexOf(term, idx)) != -1) {
                hits++;
                idx += term.length();
            }
        }
        // 饱和截断：命中 5+ 次算满分
        return Math.min(1.0, hits / 5.0);
    }

    /**
     * 实体命中得分（0.0~1.0）。
     * entities 中每命中一个得 1/entities.size 分，最高 1.0。
     */
    private double calcEntityScore(AiLongMemory m, List<String> entities) {
        if (entities.isEmpty() || !StringUtils.hasText(m.getContent())) return 0.0;
        String content = m.getContent().toLowerCase();
        long matched = entities.stream()
                .filter(e -> content.contains(e.toLowerCase()))
                .count();
        return (double) matched / entities.size();
    }

    /**
     * 从查询文本中提取关键实体（供 {@link #calcEntityScore} 使用）。
     *
     * <p>提取模式：
     * <ul>
     *   <li>订单号（PO + 数字）</li>
     *   <li>金额（数字 + 元/¥）</li>
     *   <li>日期（YYYY-MM-DD 或 MM月DD日）</li>
     *   <li>含"工厂"的两字短语</li>
     *   <li>款号（字母+数字组合，≥5字符）</li>
     * </ul>
     */
    private List<String> extractEntities(String query) {
        List<String> entities = new ArrayList<>();
        if (!StringUtils.hasText(query)) return entities;

        // 订单号（PO 开头）
        java.util.regex.Matcher m1 = Pattern.compile("PO\\d{6,}").matcher(query);
        while (m1.find()) entities.add(m1.group());

        // 金额（如 1200元、¥500）
        java.util.regex.Matcher m2 = Pattern.compile("[¥￥]?\\d+(\\.\\d+)?[元块]").matcher(query);
        while (m2.find()) entities.add(m2.group());

        // 日期（2026-01-01 或 1月1日）
        java.util.regex.Matcher m3 = Pattern.compile("\\d{4}-\\d{2}-\\d{2}|\\d{1,2}月\\d{1,2}日").matcher(query);
        while (m3.find()) entities.add(m3.group());

        // 工厂名（含"工厂"的关键词片段，取前6个字符）
        java.util.regex.Matcher m4 = Pattern.compile("[\\u4e00-\\u9fa5]{2,6}工厂").matcher(query);
        while (m4.find()) entities.add(m4.group());

        // 款号（字母+数字混合，≥5字符，如 FZ2024001）
        java.util.regex.Matcher m5 = Pattern.compile("[A-Za-z]+\\d{3,}").matcher(query);
        while (m5.find()) {
            if (m5.group().length() >= 5) entities.add(m5.group());
        }

        return entities;
    }

    private AiLongMemory baseRecord(String layer, String subjectType, String subjectId,
                                    String subjectName, String content, String embeddingId,
                                    BigDecimal confidence, String sourceSessionId) {
        AiLongMemory m = new AiLongMemory();
        m.setMemoryUid(UUID.randomUUID().toString().replace("-", ""));
        m.setLayer(layer == null ? "FACT" : layer);
        m.setSubjectType(subjectType);
        m.setSubjectId(subjectId);
        m.setSubjectName(subjectName);
        m.setContent(content);
        m.setEmbeddingId(embeddingId);
        m.setConfidence(confidence == null ? BigDecimal.valueOf(60) : confidence);
        m.setHitCount(0);
        m.setSourceSessionId(sourceSessionId);
        m.setSourceUserId(UserContext.userId());
        m.setVerified(0);
        m.setDeleteFlag(0);
        m.setCreateTime(LocalDateTime.now());
        m.setUpdateTime(LocalDateTime.now());
        return m;
    }
}
