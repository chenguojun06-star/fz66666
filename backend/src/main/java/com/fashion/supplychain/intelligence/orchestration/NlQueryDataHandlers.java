package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * NL 查询数据处理器 — 薄层 Facade，委托给域专用 Handler
 *
 * 域 Handler 清单：
 *   - ProductionQueryHandler  — 订单/产量/裁剪
 *   - OverdueQueryHandler     — 延期查询
 *   - InsightQueryHandler     — 对比/概览/帮助/AI兜底
 *   - QualityWarehouseHandler — 质检/入库/物料缺口
 */
@Component
@Slf4j
public class NlQueryDataHandlers {

    @Autowired private ProductionQueryHandler productionHandler;
    @Autowired private OverdueQueryHandler overdueHandler;
    @Autowired private InsightQueryHandler insightHandler;
    @Autowired private QualityWarehouseHandler qualityWarehouseHandler;
    @Autowired private NlQuerySmartHandlers smartHandlers;
    @Autowired private AiAdvisorService aiAdvisorService;
    @Autowired private com.fashion.supplychain.dashboard.service.DashboardQueryService dashboardQueryService;

    static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{8,}");
    static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    private final BiConsumer<NlQueryResponse, Long> insightFn = this::tryAddAiInsight;

    // ── 订单查询 ──
    public NlQueryResponse handleOrderQuery(String question, Long tenantId, String factoryId) {
        return productionHandler.handleOrderQuery(question, tenantId, factoryId, TERMINAL_STATUSES, insightFn);
    }

    // ── 延期查询 ──
    public NlQueryResponse handleOverdueQuery(Long tenantId, String factoryId) {
        return overdueHandler.handleOverdueQuery(tenantId, insightFn);
    }

    // ── 对比/趋势查询 ──
    public NlQueryResponse handleCompareQuery(Long tenantId, String factoryId) {
        return insightHandler.handleCompareQuery(tenantId, factoryId, insightFn);
    }

    // ── 产量查询 ──
    public NlQueryResponse handleProductionQuery(Long tenantId, String factoryId) {
        return productionHandler.handleProductionQuery(tenantId, factoryId, dashboardQueryService, insightFn);
    }

    // ── 质检查询 ──
    public NlQueryResponse handleQualityQuery(Long tenantId, String factoryId) {
        return qualityWarehouseHandler.handleQualityQuery(insightFn, tenantId);
    }

    // ── 入库查询 ──
    public NlQueryResponse handleWarehousingQuery(Long tenantId, String factoryId) {
        return qualityWarehouseHandler.handleWarehousingQuery();
    }

    // ── 裁剪查询 ──
    public NlQueryResponse handleCuttingQuery(String question, Long tenantId, String factoryId) {
        return productionHandler.handleCuttingQuery(question, tenantId, factoryId, TERMINAL_STATUSES, dashboardQueryService);
    }

    // ── 帮助 ──
    public NlQueryResponse handleHelpQuery() {
        return insightHandler.handleHelpQuery();
    }

    // ── 全景概要 ──
    public NlQueryResponse handleSummaryQuery(Long tenantId, String factoryId) {
        return insightHandler.handleSummaryQuery(tenantId, factoryId, smartHandlers);
    }

    // ── AI 深度兜底 ──
    public NlQueryResponse handleAiDeepFallback(String question, Long tenantId, String factoryId) {
        return insightHandler.handleAiDeepFallback(question, tenantId, factoryId, smartHandlers);
    }

    // ── 物料缺口查询 ──
    public NlQueryResponse handleMaterialGapQuery(Long tenantId) {
        return qualityWarehouseHandler.handleMaterialGapQuery(tenantId);
    }

    // ── 共享工具方法 ──

    void tryAddAiInsight(NlQueryResponse resp, Long tenantId) {
        if (resp.getAiInsight() != null) return;
        if (!aiAdvisorService.isEnabled() || !aiAdvisorService.checkAndConsumeQuota(tenantId)) return;
        try {
            String sys = "你是服装供应链分析师。根据以下业务数据，用1句话（不超过50字）指出最关键的风险或建议。直接给出结论，不要引言。";
            String insight = aiAdvisorService.chat(sys, "当前业务数据：\n" + resp.getAnswer());
            if (insight != null && !insight.isBlank()) {
                resp.setAiInsight(insight.length() > 80 ? insight.substring(0, 80) : insight);
            }
        } catch (Exception e) {
            log.debug("[NlQuery-insight] AI洞察生成失败（非阻断）: {}", e.getMessage());
        }
    }

    static String formatDelta(long current, long previous) {
        if (previous == 0) return current > 0 ? "↑ 新增" : "持平";
        long diff = current - previous;
        double pct = Math.round(diff * 1000.0 / previous) / 10.0;
        if (diff > 0) return String.format("↑%.1f%%", pct);
        if (diff < 0) return String.format("↓%.1f%%", Math.abs(pct));
        return "持平";
    }

    static String translateStatus(String status) {
        if (status == null) return "未知";
        return switch (status.toUpperCase()) {
            case "DRAFT" -> "草稿";
            case "IN_PROGRESS" -> "生产中";
            case "COMPLETED" -> "已完工";
            case "CLOSED" -> "已关单";
            case "PENDING" -> "待审核";
            default -> status;
        };
    }
}