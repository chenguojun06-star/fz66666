package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse.SignalItem;
import com.fashion.supplychain.intelligence.entity.IntelligenceSignal;
import com.fashion.supplychain.intelligence.mapper.IntelligenceSignalMapper;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.annotation.Lazy;

/**
 * 统一信号采集编排器 — 感知即分析
 *
 * <p>职责：
 * <ol>
 *   <li>并发调用所有检测器（异常、交付风险、物料短缺）</li>
 *   <li>统一计算优先级得分（critical=90, warning=65, info=40）</li>
 *   <li>可选：调用 AI 为每条信号生成一段类人化分析</li>
 *   <li>持久化到 t_intelligence_signal</li>
 *   <li>返回 IntelligenceSignalResponse</li>
 * </ol>
 *
 * <p>降级：上游任何检测器失败均跳过，不影响整体响应。
 */
@Service
@Lazy
@Slf4j
public class IntelligenceSignalOrchestrator {

    @Autowired
    private SignalCollectorHelper signalCollector;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private IntelligenceSignalMapper signalMapper;

    // ──────────────────────────────────────────────────────────────
    //  公开接口
    // ──────────────────────────────────────────────────────────────

    /**
     * 执行一次全域信号采集与分析，结果持久化后返回。
     */
    @Transactional(rollbackFor = Exception.class)
    public IntelligenceSignalResponse collectAndAnalyze() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        IntelligenceSignalResponse response = new IntelligenceSignalResponse();
        boolean aiEnabled = aiAdvisorService.isEnabled();
        response.setAiAnalysisEnabled(aiEnabled);

        List<SignalItem> allSignals = new ArrayList<>();

        // ① 异常检测
        allSignals.addAll(signalCollector.collectAnomalies(tenantId));

        // ② 交付风险
        allSignals.addAll(signalCollector.collectDeliveryRisks(tenantId));

        // ③ 物料短缺
        allSignals.addAll(signalCollector.collectMaterialShortages(tenantId));

        // ④ 服装专属信号（BOM工序缺失 + 扫码跳序 + 订单停滞）
        allSignals.addAll(signalCollector.collectGarmentSignals(tenantId));
        // ④ AI 批量分析（优先分析 critical 的前5条）
        if (aiEnabled && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            enrichWithAiAnalysis(allSignals, tenantId);
        }

        // ⑤ 批量持久化
        persistSignals(allSignals, tenantId);

        // ⑥ 统计汇总
        AtomicInteger critical = new AtomicInteger(0);
        AtomicInteger warning = new AtomicInteger(0);
        AtomicInteger info = new AtomicInteger(0);
        allSignals.forEach(s -> {
            if ("critical".equals(s.getSignalLevel())) critical.incrementAndGet();
            else if ("warning".equals(s.getSignalLevel())) warning.incrementAndGet();
            else info.incrementAndGet();
        });

        response.setTotalSignals(allSignals.size());
        response.setCriticalCount(critical.get());
        response.setWarningCount(warning.get());
        response.setInfoCount(info.get());
        response.setSignals(allSignals);

        log.info("[信号采集] tenantId={} 发现信号 {}条（critical={}, warning={}, info={}）",
                tenantId, allSignals.size(), critical.get(), warning.get(), info.get());
        return response;
    }

    /**
     * 查询未解决的高优先级信号（priority >= threshold）。
     */
    public List<IntelligenceSignal> getOpenSignals(Long tenantId, int minPriority) {
        return signalMapper.selectList(new QueryWrapper<IntelligenceSignal>()
                .eq("tenant_id", tenantId)
                .eq("status", "open")
                .eq("delete_flag", 0)
                .ge("priority_score", minPriority)
                .orderByDesc("priority_score")
                .last("LIMIT 50"));
    }

    /** 将信号标记为已处理 */
    @Transactional(rollbackFor = Exception.class)
    public void resolveSignal(Long signalId, Long tenantId) {
        signalMapper.resolveSignal(signalId, tenantId);
    }

    // ──────────────────────────────────────────────────────────────
    //  私有：AI 分析
    // ──────────────────────────────────────────────────────────────

    private void enrichWithAiAnalysis(List<SignalItem> signals, Long tenantId) {
        // 只分析 critical 的前 5 条，节省 quota
        signals.stream()
                .filter(s -> "critical".equals(s.getSignalLevel()))
                .limit(5)
                .forEach(s -> {
                    try {
                        // D-702 P0：已有 AI 分析结论则跳过，不再重复付费。
                        // 该信号每半小时就会被采集一次，而信号本身（标题/详情）通常毫无变化；
                        // 原实现无条件重调，实测每轮 5 次 × 每天 48 轮 = 240 次/天的纯浪费，
                        // 也正是「配额 50 却调用 209 次」的主要来源之一。
                        String cached = findExistingAnalysis(tenantId, s.getSignalCode(), s.getSourceId());
                        if (cached != null && !cached.isBlank()) {
                            s.setSignalAnalysis(cached);
                            return;
                        }
                        String prompt = "你是供应链智慧大脑，用2-3句话分析这个生产信号。"
                                + "格式：①为什么 ②可能影响 ③首选建议。信号：" + s.getSignalTitle()
                                + "。详情：" + s.getSignalDetail();
                        String analysis = aiAdvisorService.chat(
                                "你是一个专业的服装供应链分析师，给出简洁准确的信号分析。", prompt);
                        if (analysis != null) s.setSignalAnalysis(analysis);
                    } catch (Exception e) {
                        log.debug("[信号采集] AI 分析单条信号失败: {}", e.getMessage());
                    }
                });
    }

    /**
     * 取该信号此前已生成的 AI 分析（若有）。
     *
     * <p>用于避免对内容未变的信号重复付费。查不到返回 null，由调用方决定是否重新生成。
     */
    private String findExistingAnalysis(Long tenantId, String signalCode, String sourceId) {
        IntelligenceSignal existing = findOpenSignal(tenantId, signalCode, sourceId);
        return existing == null ? null : existing.getSignalAnalysis();
    }

    // ──────────────────────────────────────────────────────────────
    //  私有：持久化
    // ──────────────────────────────────────────────────────────────

    /**
     * D-702 P0：信号持久化改为<b>幂等 upsert</b>。
     *
     * <p><b>修复前的生产实况</b>：本方法是无条件 {@code insert}，没有任何存在性判断。
     * 采集任务每半小时跑一次（{@code IntelligenceSignalCollectionJob}，
     * cron {@code 0 10/30 * * * ?}），于是同一个信号被反复插入：
     * <pre>
     *   t_intelligence_signal 总行数 = 155,276
     *   不同 (tenant_id, signal_code) 组合 = 26
     *   stock_below_safety 重复 41,588 次 / order_delay_risk 重复 24,378 次
     *   全部 status='open'（7 个月无一条被 resolve）
     * </pre>
     * 后果有三层：
     * <ol>
     *   <li><b>数据不准确</b>：{@code getOpenSignals} 是 {@code status='open' LIMIT 50}，
     *       在 15 万条全 open 的前提下，返回的 50 条极可能是同一个信号的重复 ——
     *       前端「智能驾驶舱」看到的信号列表基本是重复项；</li>
     *   <li><b>成本浪费</b>：每轮都对 critical 信号重跑一遍 AI 分析（见
     *       {@code enrichWithAiAnalysis} 的 {@code .limit(5)}），
     *       而信号内容通常毫无变化；</li>
     *   <li><b>表膨胀</b>：7 个月 15 万行，且已无清理路径。</li>
     * </ol>
     *
     * <p><b>去重键</b>：{@code (tenant_id, signal_code, source_id, status='open')}。
     * 用 {@code source_id} 是必要的——同一 {@code signal_code} 会对多个业务对象产生
     * （例如 12000 个订单都 {@code order_delay_risk}，每单一条才算独立信号）。
     *
     * <p><b>已存在时只刷新可变字段，保留原 AI 分析</b>：
     * 信号仍在、详情/优先级可能已变，需要更新；但 AI 分析结论对同一信号依然有效，
     * 没必要重花一次调用。
     */
    private void persistSignals(List<SignalItem> items, Long tenantId) {
        for (SignalItem item : items) {
            try {
                IntelligenceSignal existing = findOpenSignal(tenantId, item.getSignalCode(), item.getSourceId());
                if (existing != null) {
                    // 已存在：刷新会变的字段，保留 signal_analysis（避免重复调 AI）
                    boolean detailChanged = !java.util.Objects.equals(
                            existing.getSignalDetail(), item.getSignalDetail());
                    existing.setSignalDetail(item.getSignalDetail());
                    existing.setSignalLevel(item.getSignalLevel());
                    existing.setPriorityScore(item.getPriorityScore());
                    existing.setUpdateTime(LocalDateTime.now());
                    signalMapper.updateById(existing);
                    item.setId(existing.getId());
                    if (detailChanged) {
                        log.debug("[信号采集] 已有信号详情变化，保留原 AI 分析避免重复调用: code={} sourceId={}",
                                item.getSignalCode(), item.getSourceId());
                    }
                    continue;
                }
                IntelligenceSignal entity = new IntelligenceSignal();
                entity.setTenantId(tenantId);
                entity.setSignalType(item.getSignalType());
                entity.setSignalCode(item.getSignalCode());
                entity.setSignalLevel(item.getSignalLevel());
                entity.setSourceDomain(item.getSourceDomain());
                entity.setSourceId(item.getSourceId());
                entity.setSignalTitle(item.getSignalTitle());
                entity.setSignalDetail(item.getSignalDetail());
                entity.setSignalAnalysis(item.getSignalAnalysis());
                entity.setPriorityScore(item.getPriorityScore());
                entity.setStatus("open");
                entity.setCreateTime(LocalDateTime.now());
                entity.setUpdateTime(LocalDateTime.now());
                entity.setDeleteFlag(0);
                signalMapper.insert(entity);
                item.setId(entity.getId());
            } catch (Exception e) {
                log.warn("[信号采集] 信号持久化失败: {}", e.getMessage());
            }
        }
    }

    /**
     * 查同租户、同 code、同来源、仍处于 open 的信号。
     *
     * <p>sourceId 可能为空（少数信号类型未指定业务对象），此时退化为「仅按 code 匹配」，
     * 且只取一条，避免 null 参与去重判断导致重复插入。
     */
    private IntelligenceSignal findOpenSignal(Long tenantId, String signalCode, String sourceId) {
        QueryWrapper<IntelligenceSignal> qw = new QueryWrapper<IntelligenceSignal>()
                .eq("tenant_id", tenantId)
                .eq("signal_code", signalCode)
                .eq("status", "open")
                .eq("delete_flag", 0);
        if (sourceId != null && !sourceId.isBlank()) {
            qw.eq("source_id", sourceId);
        }
        qw.orderByDesc("id").last("LIMIT 1");
        List<IntelligenceSignal> found = signalMapper.selectList(qw);
        return found.isEmpty() ? null : found.get(0);
    }

}
