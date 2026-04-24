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

    // ──────────────────────────────────────────────────────────────
    //  私有：持久化
    // ──────────────────────────────────────────────────────────────

    private void persistSignals(List<SignalItem> items, Long tenantId) {
        for (SignalItem item : items) {
            try {
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

}
