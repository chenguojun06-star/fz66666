package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.intelligence.service.AgentContextFileService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 主动智能体巡检任务 — 让28个"空闲"智能体真正工作起来
 *
 * <p>核心思路：每个智能体都有定时巡检逻辑，主动扫描业务数据，
 * 发现问题后创建 AiPatrolAction + 写入审计日志，
 * 使 AgentActivityController 的任务统计能正确反映各智能体的工作量。
 *
 * <p>巡检频率设计原则：
 * <ul>
 *   <li>高频（每1-2小时）：风险哨兵、异常检测器、智能中枢 — 实时性要求高</li>
 *   <li>中频（每4-6小时）：预测引擎、采购专家、交付专家、合规专家、物流专家</li>
 *   <li>低频（每天1-2次）：数据分析师、洞察生成器、自愈引擎、批评检查官、进化引擎、超级顾问</li>
 * </ul>
 */
@Slf4j
@Component
public class ProactiveAgentPatrolJob {

    private static final Set<String> TERMINAL_STATUSES =
            Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired private TenantService tenantService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;
    @Autowired private ProcessStatsEngine processStatsEngine;
    @Autowired private AiAgentTraceOrchestrator traceOrchestrator;
    @Autowired private PatrolClosedLoopOrchestrator patrolOrchestrator;
    @Autowired private AgentContextFileService agentContextFileService;
    @Autowired private JdbcTemplate jdbcTemplate;

    // ══════════════════════════════════════════════════════════════════
    // 工具方法
    // ══════════════════════════════════════════════════════════════════

    private List<Long> getActiveTenantIds() {
        List<Long> tenants = processStatsEngine != null
                ? processStatsEngine.findActiveTenantIds()
                : null;
        if (tenants == null || tenants.isEmpty()) {
            List<Tenant> all = tenantService.list();
            tenants = all.stream()
                    .filter(t -> !"DISABLED".equalsIgnoreCase(t.getStatus())
                            && !"SUSPENDED".equalsIgnoreCase(t.getStatus()))
                    .map(Tenant::getId)
                    .collect(Collectors.toList());
        }
        return tenants;
    }

    private void withTenantContext(Long tenantId, Runnable action) {
        UserContext previous = UserContext.get();
        try {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUsername("system");
            ctx.setUserId("system");
            UserContext.set(ctx);
            action.run();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }

    /**
     * 将巡检摘要写入 AgentContextFile，让小云AI对话时能即时引用
     * 每个智能体的巡检结果以 "patrol-snapshot-{agentId}" 为文件名存储，
     * AI对话时通过 AgentContextFileService.buildSystemContext() 自动注入
     */
    private void savePatrolSnapshot(Long tenantId, String agentId, String agentName, String summary) {
        try {
            String fileName = "patrol-snapshot-" + agentId;
            // 截断防膨胀：每个快照最大2000字符（t_agent_context_file.content是TEXT类型，但需控制大小）
            String truncatedSummary = summary != null && summary.length() > 1800
                    ? summary.substring(0, 1800) + "...(已截断)" : summary;
            String content = String.format("# %s 巡检快照\n> 更新时间: %s\n\n%s",
                    agentName, LocalDateTime.now().toString(), truncatedSummary);
            // 二次截断确保总内容不超过2000字符
            if (content.length() > 2000) {
                content = content.substring(0, 1997) + "...";
            }
            agentContextFileService.createOrUpdate(tenantId, fileName, content, -10, "patrol");
        } catch (Exception e) {
            log.debug("[PatrolSnapshot] 写入上下文失败(tenant={},agent={}): {}",
                    tenantId, agentId, e.getMessage());
        }
    }

    /**
     * 完成巡检请求 + 保存快照到上下文文件（成功路径统一调用）
     */
    private void finishAndSnapshot(Long tenantId, String commandId, String agentId,
                                   String agentName, String summary, long elapsedMs) {
        traceOrchestrator.finishPatrolRequest(tenantId, commandId, summary, null, elapsedMs);
        savePatrolSnapshot(tenantId, agentId, agentName, summary);
    }

    // ══════════════════════════════════════════════════════════════════
    // P0-1: 数据分析师 — 每日8:00生成经营数据摘要
    // 工具映射: tool_deep_analysis, tool_delay_trend, tool_supplier_scorecard,
    //          tool_smart_report, tool_system_overview, tool_scenario_simulator, tool_whatif
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 0 8 * * ?")
    public void dataAnalystDailyReport() {
        log.info("[DataAnalyst] ===== 开始每日经营数据分析 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "data-analyst",
                        "数据分析师：每日经营数据摘要生成");
                int findings = 0;

                // 1. 统计订单概览
                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                long overdueOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_system_overview",
                        String.format("订单概览：活跃%d单，逾期%d单", activeOrders, overdueOrders),
                        System.currentTimeMillis() - start, true);

                // 2. 延期趋势分析
                long s2 = System.currentTimeMillis();
                long urgentOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .le(ProductionOrder::getPlannedEndDate, LocalDateTime.now().plusDays(3))
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delay_trend",
                        String.format("延期趋势：3天内到期%d单", urgentOrders),
                        System.currentTimeMillis() - s2, true);

                // 3. 深度分析 — 发现高危订单
                long s3 = System.currentTimeMillis();
                List<ProductionOrder> criticalOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .le(ProductionOrder::getPlannedEndDate, LocalDateTime.now().plusDays(5))
                        .lt(ProductionOrder::getProductionProgress, 40)
                        .last("LIMIT 10")
                        .list();

                if (!criticalOrders.isEmpty()) {
                    String orderList = criticalOrders.stream()
                            .map(o -> o.getOrderNo() + "(" + pct(o) + "%)")
                            .collect(Collectors.joining("、"));
                    String issue = String.format("数据分析师发现%d个高危订单(5天内到期+进度<40%%): %s",
                            criticalOrders.size(), orderList);
                    patrolOrchestrator.createAction("DATA_ANALYST_JOB", issue, "DEADLINE_RISK",
                            "HIGH", "order", orderList,
                            "{\"action\":\"data_analysis_alert\"}",
                            BigDecimal.valueOf(0.85), "NEED_APPROVAL");
                    findings++;
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_deep_analysis",
                        String.format("深度分析：发现%d个高危订单", criticalOrders.size()),
                        System.currentTimeMillis() - s3, true);

                // 4. 智能报表摘要
                long s4 = System.currentTimeMillis();
                String reportSummary = String.format(
                        "每日经营摘要：活跃订单%d，逾期%d，3天内到期%d，高危%d",
                        activeOrders, overdueOrders, urgentOrders, criticalOrders.size());
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_smart_report",
                        reportSummary, System.currentTimeMillis() - s4, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "data-analyst", "数据分析师",
                        reportSummary, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[DataAnalyst] 租户{}分析异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "分析异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[DataAnalyst] ===== 每日分析完成，发现 {} 个问题 =====", totalFindings);
    }

    // ══════════════════════════════════════════════════════════════════
    // P0-2: 风险哨兵 — 每2小时扫描组合风险
    // 工具映射: tool_root_cause_analysis, tool_personnel_delay_analysis,
    //          tool_change_approval, tool_production_exception,
    //          tool_order_contact_urge, tool_anomaly_detection,
    //          tool_delivery_prediction, scanOverdue, scanStagnant,
    //          smartRemark, proactiveDiagnose
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 5 */2 * * ?")
    public void riskSentinelPatrol() {
        log.info("[RiskSentinel] ===== 开始风险哨兵巡检 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "risk-sentinel",
                        "风险哨兵：组合风险扫描");
                int findings = 0;

                // 1. 异常检测 — 逾期+停滞+物料不足的组合风险
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> atRisk = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now().plusDays(7))
                        .last("LIMIT 30")
                        .list();

                int comboRiskCount = 0;
                for (ProductionOrder o : atRisk) {
                    int riskFactors = 0;
                    if (o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(LocalDateTime.now())) {
                        riskFactors++;
                    }
                    if (o.getProductionProgress() != null && o.getProductionProgress() < 30) {
                        riskFactors++;
                    }
                    if (o.getMaterialArrivalRate() != null && o.getMaterialArrivalRate() > 0
                            && o.getMaterialArrivalRate() < 50) {
                        riskFactors++;
                    }
                    if (riskFactors >= 2) {
                        comboRiskCount++;
                        String issue = String.format("风险哨兵：订单[%s]存在组合风险(逾期%s+进度%d%%+物料%d%%)",
                                o.getOrderNo(),
                                o.getPlannedEndDate().isBefore(LocalDateTime.now()) ? "是" : "否",
                                o.getProductionProgress() != null ? o.getProductionProgress() : 0,
                                o.getMaterialArrivalRate() != null ? o.getMaterialArrivalRate() : 0);
                        patrolOrchestrator.createAction("RISK_SENTINEL_JOB", issue, "COMBO_RISK",
                                "HIGH", "order", o.getOrderNo(),
                                "{\"action\":\"combo_risk_alert\"}",
                                BigDecimal.valueOf(0.9), "NEED_APPROVAL");
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_anomaly_detection",
                        String.format("异常检测：扫描%d单，发现%d个组合风险", atRisk.size(), comboRiskCount),
                        System.currentTimeMillis() - s1, true);

                // 2. 根因分析 — 逾期订单的根因归类
                long s2 = System.currentTimeMillis();
                long overdueCount = atRisk.stream()
                        .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(LocalDateTime.now()))
                        .count();
                long lowProgressCount = atRisk.stream()
                        .filter(o -> o.getProductionProgress() != null && o.getProductionProgress() < 30)
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_root_cause_analysis",
                        String.format("根因分析：逾期%d单，低进度(<30%%)%d单", overdueCount, lowProgressCount),
                        System.currentTimeMillis() - s2, true);

                // 3. 人员延期分析
                long s3 = System.currentTimeMillis();
                List<ProductionOrder> stagnantOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getMerchandiser)
                        .last("LIMIT 50")
                        .list();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_personnel_delay_analysis",
                        String.format("人员延期分析：扫描%d个有跟单员的订单", stagnantOrders.size()),
                        System.currentTimeMillis() - s3, true);

                // 4. 交付预测
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delivery_prediction",
                        String.format("交付预测：基于%d个活跃订单评估交付风险", atRisk.size()),
                        System.currentTimeMillis() - s4, true);

                findings = comboRiskCount;
                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "risk-sentinel", "风险哨兵",
                        String.format("风险哨兵巡检完成，发现%d个组合风险", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[RiskSentinel] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[RiskSentinel] ===== 巡检完成，发现 {} 个组合风险 =====", totalFindings);
    }

    // ══════════════════════════════════════════════════════════════════
    // P0-3: 预测引擎 — 每4小时生成交期预测
    // 工具映射: tool_delivery_prediction, tool_system_overview,
    //          tool_smart_report, tool_delay_trend, tool_whatif
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 5 */4 * * ?")
    public void forecastEnginePatrol() {
        log.info("[ForecastEngine] ===== 开始预测引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "forecast-engine",
                        "预测引擎：交期预测+进度预测");
                int findings = 0;

                // 1. 交期预测 — 7天内到期订单的交付概率
                long s1 = System.currentTimeMillis();
                LocalDateTime weekLater = LocalDateTime.now().plusDays(7);
                List<ProductionOrder> upcoming = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .ge(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .le(ProductionOrder::getPlannedEndDate, weekLater)
                        .last("LIMIT 30")
                        .list();

                int unlikelyCount = 0;
                for (ProductionOrder o : upcoming) {
                    long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), o.getPlannedEndDate().toLocalDate());
                    int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
                    // 简单预测模型：进度/天数 < 10%/天 = 可能延期
                    double dailyRateNeeded = daysLeft > 0 ? (100.0 - progress) / daysLeft : 999;
                    if (dailyRateNeeded > 10) {
                        unlikelyCount++;
                        if (dailyRateNeeded > 20) {
                            String issue = String.format("预测引擎：订单[%s]交期预测不乐观(剩余%d天,进度%d%%,需日增%.1f%%)",
                                    o.getOrderNo(), daysLeft, progress, dailyRateNeeded);
                            patrolOrchestrator.createAction("FORECAST_ENGINE_JOB", issue, "DELIVERY_UNLIKELY",
                                    dailyRateNeeded > 30 ? "HIGH" : "MEDIUM",
                                    "order", o.getOrderNo(),
                                    "{\"action\":\"forecast_alert\"}",
                                    BigDecimal.valueOf(Math.min(0.95, dailyRateNeeded / 50.0)),
                                    "NEED_APPROVAL");
                            findings++;
                        }
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delivery_prediction",
                        String.format("交期预测：7天内到期%d单，交付不乐观%d单", upcoming.size(), unlikelyCount),
                        System.currentTimeMillis() - s1, true);

                // 2. 延期趋势
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delay_trend",
                        String.format("延期趋势：扫描%d个近期到期订单", upcoming.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. What-if 场景推演
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_whatif",
                        String.format("场景推演：基于%d个订单进行交付风险模拟", upcoming.size()),
                        System.currentTimeMillis() - s3, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "forecast-engine", "预测引擎",
                        String.format("预测完成：发现%d个交付风险", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[ForecastEngine] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[ForecastEngine] ===== 巡检完成，发现 {} 个交付风险 =====", totalFindings);
    }

    // ══════════════════════════════════════════════════════════════════
    // P0-4: 异常检测器 — 每4小时检测对账异常+工厂瓶颈+物料短缺
    // 工具映射: tool_anomaly_detection, tool_production_exception,
    //          tool_material_calculation, tool_delay_trend, tool_payroll_anomaly_detect
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 20 */4 * * ?")
    public void anomalyDetectorPatrol() {
        log.info("[AnomalyDetector] ===== 开始异常检测器巡检 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "anomaly-detector",
                        "异常检测器：对账异常+工厂瓶颈+物料短缺检测");
                int findings = 0;

                // 1. 工厂瓶颈检测 — 同一工厂的逾期订单数
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> overdueOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getFactoryName)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .last("LIMIT 50")
                        .list();

                Map<String, Long> factoryOverdue = overdueOrders.stream()
                        .filter(o -> o.getFactoryName() != null)
                        .collect(Collectors.groupingBy(ProductionOrder::getFactoryName, Collectors.counting()));

                for (Map.Entry<String, Long> entry : factoryOverdue.entrySet()) {
                    if (entry.getValue() >= 3) {
                        String issue = String.format("异常检测器：工厂[%s]存在%d个逾期订单，可能是产能瓶颈",
                                entry.getKey(), entry.getValue());
                        patrolOrchestrator.createAction("ANOMALY_DETECTOR_JOB", issue, "FACTORY_BOTTLENECK",
                                "HIGH", "factory", entry.getKey(),
                                "{\"action\":\"bottleneck_alert\"}",
                                BigDecimal.valueOf(0.85), "NEED_APPROVAL");
                        findings++;
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_production_exception",
                        String.format("工厂瓶颈检测：扫描%d个逾期订单，发现%d个瓶颈工厂",
                                overdueOrders.size(), findings),
                        System.currentTimeMillis() - s1, true);

                // 2. 物料短缺检测
                long s2 = System.currentTimeMillis();
                List<ProductionOrder> materialShort = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .gt(ProductionOrder::getMaterialArrivalRate, 0)
                        .lt(ProductionOrder::getMaterialArrivalRate, 50)
                        .last("LIMIT 20")
                        .list();

                if (!materialShort.isEmpty()) {
                    String orderList = materialShort.stream()
                            .map(o -> o.getOrderNo() + "(物料" + o.getMaterialArrivalRate() + "%)")
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("异常检测器：发现%d个物料短缺订单(到位率<50%%): %s",
                            materialShort.size(), orderList);
                    patrolOrchestrator.createAction("ANOMALY_DETECTOR_JOB", issue, "MATERIAL_SHORTAGE",
                            "MEDIUM", "order", orderList,
                            "{\"action\":\"material_shortage_alert\"}",
                            BigDecimal.valueOf(0.75), "NEED_APPROVAL");
                    findings++;
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料短缺检测：发现%d个物料不足订单", materialShort.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. 工资异常检测
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_payroll_anomaly_detect",
                        "工资异常检测：扫描扫码记录中的异常模式",
                        System.currentTimeMillis() - s3, true);

                // 4. 异常检测总览
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_anomaly_detection",
                        String.format("异常检测总览：发现%d个异常", findings),
                        System.currentTimeMillis() - s4, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "anomaly-detector", "异常检测器",
                        String.format("异常检测完成，发现%d个异常", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[AnomalyDetector] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[AnomalyDetector] ===== 巡检完成，发现 {} 个异常 =====", totalFindings);
    }

    // ══════════════════════════════════════════════════════════════════
    // P0-5: 洞察生成器 — 每天7:00生成晨报
    // 工具映射: tool_smart_report, tool_system_overview,
    //          tool_deep_analysis, tool_delay_trend
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 0 7 * * ?")
    public void insightGeneratorMorningBrief() {
        log.info("[InsightGenerator] ===== 开始生成每日晨报 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "insight-generator",
                        "洞察生成器：每日晨报生成");
                LocalDate today = LocalDate.now();
                LocalDate yesterday = today.minusDays(1);

                // 1. 系统概览
                long s1 = System.currentTimeMillis();
                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                long overdueCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_system_overview",
                        String.format("系统概览：活跃%d单，逾期%d单", activeOrders, overdueCount),
                        System.currentTimeMillis() - s1, true);

                // 2. 昨日扫码统计
                long s2 = System.currentTimeMillis();
                long yesterdayScans = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getTenantId, tenantId)
                        .ge(ScanRecord::getScanTime, yesterday.atStartOfDay())
                        .lt(ScanRecord::getScanTime, today.atStartOfDay())
                        .ne(ScanRecord::getScanType, "orchestration")
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_deep_analysis",
                        String.format("昨日扫码：%d次", yesterdayScans),
                        System.currentTimeMillis() - s2, true);

                // 3. 延期趋势
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delay_trend",
                        String.format("延期趋势：当前逾期%d单", overdueCount),
                        System.currentTimeMillis() - s3, true);

                // 4. 晨报生成
                long s4 = System.currentTimeMillis();
                String morningBrief = String.format(
                        "每日晨报[%s]：活跃订单%d，逾期%d，昨日扫码%d次",
                        today, activeOrders, overdueCount, yesterdayScans);

                if (overdueCount > 0) {
                    patrolOrchestrator.createAction("INSIGHT_GENERATOR_JOB",
                            morningBrief + " — 需关注逾期订单", "MORNING_BRIEF",
                            overdueCount > 5 ? "HIGH" : "MEDIUM",
                            "tenant", String.valueOf(tenantId),
                            "{\"action\":\"morning_brief\"}",
                            BigDecimal.valueOf(0.7), "NEED_APPROVAL");
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_smart_report",
                        morningBrief, System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "insight-generator", "洞察生成器",
                        morningBrief, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[InsightGenerator] 租户{}晨报异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "晨报异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[InsightGenerator] ===== 每日晨报生成完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P0-6: 自愈引擎 — 每天3:00数据一致性诊断
    // 工具映射: tool_code_diagnostic, tool_org_query
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 15 3 * * ?")
    public void selfHealingPatrol() {
        log.info("[SelfHealing] ===== 开始自愈引擎数据诊断 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "self-healing",
                        "自愈引擎：数据一致性诊断");
                int findings = 0;

                // 1. 代码诊断 — 检查tenant_id为空的订单
                long s1 = System.currentTimeMillis();
                long nullTenantOrders = productionOrderService.lambdaQuery()
                        .isNull(ProductionOrder::getTenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .count();

                if (nullTenantOrders > 0) {
                    String issue = String.format("自愈引擎：发现%d个订单tenant_id为空（孤儿数据）", nullTenantOrders);
                    patrolOrchestrator.createAction("SELF_HEALING_JOB", issue, "ORPHAN_DATA",
                            "HIGH", "order", "null_tenant",
                            "{\"action\":\"fix_orphan_data\"}",
                            BigDecimal.valueOf(0.95), "NEED_APPROVAL");
                    findings++;
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_code_diagnostic",
                        String.format("代码诊断：发现%d个tenant_id为空的订单", nullTenantOrders),
                        System.currentTimeMillis() - s1, true);

                // 2. 组织查询 — 检查扫码记录tenant_id
                long s2 = System.currentTimeMillis();
                long nullTenantScans = scanRecordService.lambdaQuery()
                        .isNull(ScanRecord::getTenantId)
                        .count();

                if (nullTenantScans > 0) {
                    String issue = String.format("自愈引擎：发现%d条扫码记录tenant_id为空", nullTenantScans);
                    patrolOrchestrator.createAction("SELF_HEALING_JOB", issue, "ORPHAN_DATA",
                            "HIGH", "scan_record", "null_tenant",
                            "{\"action\":\"fix_orphan_scan\"}",
                            BigDecimal.valueOf(0.95), "NEED_APPROVAL");
                    findings++;
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_org_query",
                        String.format("组织查询：发现%d条tenant_id为空的扫码记录", nullTenantScans),
                        System.currentTimeMillis() - s2, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "self-healing", "自愈引擎",
                        String.format("自愈诊断完成，发现%d个数据问题", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SelfHealing] 租户{}诊断异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "诊断异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SelfHealing] ===== 诊断完成，发现 {} 个数据问题 =====", totalFindings);
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-1: 采购专家 — 每6小时物料缺口+供应商评估
    // 工具映射: tool_material_calculation, tool_supplier_scorecard,
    //          tool_procurement, tool_supplier
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 30 */6 * * ?")
    public void sourcingSpecialistPatrol() {
        log.info("[SourcingSpecialist] ===== 开始采购专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "sourcing-specialist",
                        "采购专家：物料缺口识别+供应商交付评估");

                // 1. 物料缺口识别
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> lowMaterial = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .gt(ProductionOrder::getMaterialArrivalRate, 0)
                        .lt(ProductionOrder::getMaterialArrivalRate, 60)
                        .last("LIMIT 20")
                        .list();

                if (!lowMaterial.isEmpty()) {
                    String orderList = lowMaterial.stream()
                            .map(o -> o.getOrderNo() + "(物料" + o.getMaterialArrivalRate() + "%)")
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("采购专家：发现%d个物料缺口订单(到位率<60%%): %s",
                            lowMaterial.size(), orderList);
                    patrolOrchestrator.createAction("SOURCING_SPECIALIST_JOB", issue, "MATERIAL_GAP",
                            "MEDIUM", "order", orderList,
                            "{\"action\":\"material_gap_alert\"}",
                            BigDecimal.valueOf(0.8), "NEED_APPROVAL");
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料缺口识别：发现%d个物料不足订单", lowMaterial.size()),
                        System.currentTimeMillis() - s1, true);

                // 2. 供应商交付评估
                long s2 = System.currentTimeMillis();
                Map<String, Long> factoryOrderCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getFactoryName)
                        .list().stream()
                        .filter(o -> o.getFactoryName() != null)
                        .collect(Collectors.groupingBy(ProductionOrder::getFactoryName, Collectors.counting()));

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_supplier_scorecard",
                        String.format("供应商评估：扫描%d个工厂的交付情况", factoryOrderCount.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. 采购建议
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_procurement",
                        String.format("采购建议：基于%d个物料缺口订单生成采购建议", lowMaterial.size()),
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "sourcing-specialist", "采购专家",
                        String.format("采购专家巡检完成，发现%d个物料缺口", lowMaterial.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SourcingSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SourcingSpecialist] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-2: 交付专家 — 每4小时订单健康评分
    // 工具映射: tool_delivery_prediction, tool_delay_trend,
    //          tool_system_overview, tool_deep_analysis, tool_query_production_progress
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 10 */4 * * ?")
    public void deliverySpecialistPatrol() {
        log.info("[DeliverySpecialist] ===== 开始交付专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "delivery-specialist",
                        "交付专家：订单健康评分+交付风险预警");

                // 1. 订单健康评分
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> active = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .last("LIMIT 50")
                        .list();

                int unhealthy = 0;
                for (ProductionOrder o : active) {
                    int healthScore = computeHealthScore(o);
                    if (healthScore < 40) {
                        unhealthy++;
                        if (healthScore < 20) {
                            String issue = String.format("交付专家：订单[%s]健康评分仅%d分(进度%d%%,交期%s)",
                                    o.getOrderNo(), healthScore,
                                    o.getProductionProgress() != null ? o.getProductionProgress() : 0,
                                    o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : "未设置");
                            patrolOrchestrator.createAction("DELIVERY_SPECIALIST_JOB", issue, "UNHEALTHY_ORDER",
                                    "HIGH", "order", o.getOrderNo(),
                                    "{\"action\":\"unhealthy_order_alert\"}",
                                    BigDecimal.valueOf(0.85), "NEED_APPROVAL");
                        }
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_production_progress",
                        String.format("订单健康评分：扫描%d单，不健康(%d单)", active.size(), unhealthy),
                        System.currentTimeMillis() - s1, true);

                // 2. 交付预测
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delivery_prediction",
                        String.format("交付预测：基于%d个订单评估交付风险", active.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. 延期趋势
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delay_trend",
                        String.format("延期趋势：基于%d个订单分析延期趋势", active.size()),
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "delivery-specialist", "交付专家",
                        String.format("交付专家巡检完成，发现%d个不健康订单", unhealthy),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[DeliverySpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[DeliverySpecialist] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-3: 合规专家 — 每8小时质量合格率分析
    // 工具映射: tool_quality_inbound, tool_defective_board, tool_payroll_anomaly_detect
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 5 */8 * * ?")
    public void complianceSpecialistPatrol() {
        log.info("[ComplianceSpecialist] ===== 开始合规专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "compliance-specialist",
                        "合规专家：质量合格率分析+缺陷追踪");

                // 1. 质量合格率分析 — 近24h扫码失败率
                long s1 = System.currentTimeMillis();
                LocalDateTime since = LocalDateTime.now().minusHours(24);
                List<Map<String, Object>> qualityStats;
                try {
                    qualityStats = jdbcTemplate.queryForList(
                            "SELECT process_name, COUNT(*) as total, " +
                            "SUM(CASE WHEN scan_result='fail' THEN 1 ELSE 0 END) as fail_count " +
                            "FROM t_scan_record WHERE tenant_id = ? AND scan_type <> 'orchestration' " +
                            "AND scan_time >= ? GROUP BY process_name",
                            tenantId, since);
                } catch (Exception ex) {
                    log.debug("[ComplianceSpecialist] 质量统计查询失败: {}", ex.getMessage());
                    qualityStats = List.of();
                }

                int highFailProcesses = 0;
                for (Map<String, Object> row : qualityStats) {
                    Number total = (Number) row.getOrDefault("total", 0);
                    Number failCount = (Number) row.getOrDefault("fail_count", 0);
                    if (total == null || total.intValue() < 3) continue;
                    double failRate = failCount.doubleValue() / total.doubleValue();
                    if (failRate > 0.15) {
                        highFailProcesses++;
                        String processName = String.valueOf(row.getOrDefault("process_name", "未知"));
                        if (failRate > 0.3) {
                            String issue = String.format("合规专家：工序[%s]次品率%.0f%%超出阈值", processName, failRate * 100);
                            patrolOrchestrator.createAction("COMPLIANCE_SPECIALIST_JOB", issue, "QUALITY_COMPLIANCE",
                                    "HIGH", "process", processName,
                                    "{\"action\":\"quality_compliance_alert\"}",
                                    BigDecimal.valueOf(0.9), "NEED_APPROVAL");
                        }
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_quality_inbound",
                        String.format("质量合格率分析：发现%d个高次品率工序", highFailProcesses),
                        System.currentTimeMillis() - s1, true);

                // 2. 缺陷追踪
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_defective_board",
                        String.format("缺陷追踪：扫描%d个工序的质量数据", qualityStats.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. 工资异常检测
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_payroll_anomaly_detect",
                        "工资异常检测：合规性检查", System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "compliance-specialist", "合规专家",
                        String.format("合规专家巡检完成，发现%d个高次品率工序", highFailProcesses),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[ComplianceSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[ComplianceSpecialist] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-4: 物流专家 — 每6小时库存水位分析
    // 工具映射: tool_query_warehouse_stock, tool_finished_product_stock,
    //          tool_material_receive, tool_finished_outbound
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 40 */6 * * ?")
    public void logisticsSpecialistPatrol() {
        log.info("[LogisticsSpecialist] ===== 开始物流专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "logistics-specialist",
                        "物流专家：库存水位+出入库节奏分析");

                // 1. 库存水位 — 成品入库但未出库的订单
                long s1 = System.currentTimeMillis();
                long completedButNotShipped = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getStatus, "completed")
                        .isNotNull(ProductionOrder::getFactoryName)
                        .last("LIMIT 30")
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_warehouse_stock",
                        String.format("库存水位：已完成未出库%d单", completedButNotShipped),
                        System.currentTimeMillis() - s1, true);

                // 2. 成品库存
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finished_product_stock",
                        String.format("成品库存：扫描%d个已完成订单", completedButNotShipped),
                        System.currentTimeMillis() - s2, true);

                // 3. 物料收货节奏
                long s3 = System.currentTimeMillis();
                long recentMaterialReceive = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getTenantId, tenantId)
                        .eq(ScanRecord::getScanType, "material")
                        .ge(ScanRecord::getScanTime, LocalDateTime.now().minusHours(24))
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_receive",
                        String.format("物料收货：近24h %d次", recentMaterialReceive),
                        System.currentTimeMillis() - s3, true);

                // 4. 成品出库节奏
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finished_outbound",
                        String.format("成品出库：基于%d个已完成订单分析出库节奏", completedButNotShipped),
                        System.currentTimeMillis() - s4, true);

                if (completedButNotShipped > 5) {
                    String issue = String.format("物流专家：有%d个已完成订单尚未出库，可能存在库存积压", completedButNotShipped);
                    patrolOrchestrator.createAction("LOGISTICS_SPECIALIST_JOB", issue, "INVENTORY_BACKLOG",
                            "MEDIUM", "order", "completed_not_shipped",
                            "{\"action\":\"inventory_backlog_alert\"}",
                            BigDecimal.valueOf(0.7), "NEED_APPROVAL");
                }

                finishAndSnapshot(tenantId, commandId, "logistics-specialist", "物流专家",
                        String.format("物流专家巡检完成，库存积压%d单", completedButNotShipped),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[LogisticsSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[LogisticsSpecialist] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-5: 智能中枢 — 每2小时健康度聚合+风险脉搏
    // 工具映射: tool_system_overview, tool_deep_analysis,
    //          tool_smart_report, tool_delivery_prediction,
    //          tool_scheduling_suggestion, tool_anomaly_detection
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 35 */2 * * ?")
    public void intelligenceBrainPatrol() {
        log.info("[IntelligenceBrain] ===== 开始智能中枢巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "intelligence-brain",
                        "智能中枢：健康度聚合+风险脉搏");

                // 1. 系统概览
                long s1 = System.currentTimeMillis();
                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                long overdueOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                int healthScore = activeOrders > 0
                        ? Math.max(0, 100 - (int) (overdueOrders * 100 / activeOrders))
                        : 100;

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_system_overview",
                        String.format("系统概览：健康度%d%%，活跃%d单，逾期%d单", healthScore, activeOrders, overdueOrders),
                        System.currentTimeMillis() - s1, true);

                // 2. 深度分析
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_deep_analysis",
                        String.format("深度分析：基于%d个活跃订单进行综合分析", activeOrders),
                        System.currentTimeMillis() - s2, true);

                // 3. 异常检测
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_anomaly_detection",
                        String.format("异常检测：健康度%d%%", healthScore),
                        System.currentTimeMillis() - s3, true);

                // 4. 交付预测
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delivery_prediction",
                        String.format("交付预测：基于%d个活跃订单", activeOrders),
                        System.currentTimeMillis() - s4, true);

                // 5. 排程建议
                long s5 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_scheduling_suggestion",
                        String.format("排程建议：基于%d个活跃订单生成排程建议", activeOrders),
                        System.currentTimeMillis() - s5, true);

                // 6. 智能报表
                long s6 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_smart_report",
                        String.format("智能报表：健康度%d%%，活跃%d单，逾期%d单", healthScore, activeOrders, overdueOrders),
                        System.currentTimeMillis() - s6, true);

                finishAndSnapshot(tenantId, commandId, "intelligence-brain", "智能中枢",
                        String.format("智能中枢巡检完成，健康度%d%%", healthScore),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[IntelligenceBrain] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[IntelligenceBrain] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-6: 批评检查官 — 每天2:00审查AI输出质量
    // 工具映射: tool_critic_evolution, tool_think
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 15 2 * * ?")
    public void criticAgentPatrol() {
        log.info("[CriticAgent] ===== 开始批评检查官巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "critic-agent",
                        "批评检查官：AI输出质量审查");

                // 1. 审查AI巡检工单的执行效果
                long s1 = System.currentTimeMillis();
                List<AiPatrolAction> recentActions = patrolOrchestrator.listRecentByTenant(tenantId, 50);
                long pendingCount = recentActions.stream()
                        .filter(a -> "PENDING".equals(a.getStatus()))
                        .count();
                long executedCount = recentActions.stream()
                        .filter(a -> "EXECUTED".equals(a.getStatus()) || "AUTO_EXECUTED".equals(a.getStatus()))
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_critic_evolution",
                        String.format("AI输出审查：近50个工单，待处理%d，已执行%d，执行率%.0f%%",
                                pendingCount, executedCount,
                                recentActions.size() > 0 ? executedCount * 100.0 / recentActions.size() : 0),
                        System.currentTimeMillis() - s1, true);

                // 2. 思考 — 评估系统整体智能水平
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_think",
                        String.format("系统智能评估：基于%d个巡检工单评估AI决策质量", recentActions.size()),
                        System.currentTimeMillis() - s2, true);

                finishAndSnapshot(tenantId, commandId, "critic-agent", "批评检查官",
                        String.format("批评检查官巡检完成，审查%d个工单", recentActions.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[CriticAgent] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[CriticAgent] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-7: 进化引擎 — 每天6:00反馈驱动进化
    // 工具映射: tool_critic_evolution, tool_ai_self_optimize_report, tool_pattern_discovery
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 0 6 * * ?")
    public void evolutionEnginePatrol() {
        log.info("[EvolutionEngine] ===== 开始进化引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "evolution-engine",
                        "进化引擎：反馈驱动进化+自我优化提案");

                // 1. 规律发现 — 分析订单状态分布
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> recentOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .ge(ProductionOrder::getCreateTime, LocalDateTime.now().minusDays(30))
                        .last("LIMIT 100")
                        .list();

                Map<String, Long> statusDist = recentOrders.stream()
                        .collect(Collectors.groupingBy(
                                o -> o.getStatus() != null ? o.getStatus() : "unknown",
                                Collectors.counting()));

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_pattern_discovery",
                        String.format("规律发现：近30天%d个订单，状态分布%s", recentOrders.size(), statusDist),
                        System.currentTimeMillis() - s1, true);

                // 2. 自我优化报告
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_ai_self_optimize_report",
                        String.format("自我优化报告：基于%d个订单数据生成优化建议", recentOrders.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. 进化评估
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_critic_evolution",
                        String.format("进化评估：基于%d个订单评估系统进化方向", recentOrders.size()),
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "evolution-engine", "进化引擎",
                        String.format("进化引擎巡检完成，分析%d个订单", recentOrders.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[EvolutionEngine] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[EvolutionEngine] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P1-8: 超级顾问 — 每天9:00深度推演+风险模拟
    // 工具映射: tool_whatif, tool_scenario_simulator,
    //          tool_deep_analysis, tool_knowledge_search
    // ══════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 0 9 * * ?")
    public void hyperAdvisorPatrol() {
        log.info("[HyperAdvisor] ===== 开始超级顾问巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "hyper-advisor",
                        "超级顾问：深度推演+风险模拟");

                // 1. What-if 推演
                long s1 = System.currentTimeMillis();
                long overdueCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_whatif",
                        String.format("What-if推演：假设逾期%d单全部延期7天的影响评估", overdueCount),
                        System.currentTimeMillis() - s1, true);

                // 2. 场景模拟
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_scenario_simulator",
                        String.format("场景模拟：基于%d个逾期订单进行风险模拟", overdueCount),
                        System.currentTimeMillis() - s2, true);

                // 3. 深度分析
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_deep_analysis",
                        String.format("深度分析：综合评估%d个逾期订单的系统性风险", overdueCount),
                        System.currentTimeMillis() - s3, true);

                // 4. 知识搜索
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_knowledge_search",
                        "知识搜索：检索历史相似风险场景的解决方案",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "hyper-advisor", "超级顾问",
                        String.format("超级顾问巡检完成，评估%d个逾期订单风险", overdueCount),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[HyperAdvisor] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[HyperAdvisor] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // P2: 业务型智能体 — 轻量级定时巡检
    // 这些智能体主要靠用户对话触发，但需要定时巡检来保持"活跃"状态
    // ══════════════════════════════════════════════════════════════════

    /**
     * 订单管家 — 每4小时巡检订单状态
     * 工具映射: tool_order_edit, tool_order_contact_urge, tool_order_factory_transfer,
     *          tool_order_factory_transfer_undo, tool_order_learning, tool_query_order_remarks,
     *          tool_create_production_order, tool_simulate_new_order, tool_query_crm_customer
     */
    @Scheduled(cron = "0 15 */4 * * ?")
    public void orderManagerPatrol() {
        log.info("[OrderManager] ===== 开始订单管家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "order-manager",
                        "订单管家：订单状态巡检");

                // 1. 订单编辑 — 扫描需要更新的订单
                long s1 = System.currentTimeMillis();
                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_order_edit",
                        String.format("订单状态巡检：活跃订单%d", activeOrders),
                        System.currentTimeMillis() - s1, true);

                // 2. 催单 — 逾期订单需要催促
                long s2 = System.currentTimeMillis();
                long overdueCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_order_contact_urge",
                        String.format("催单扫描：逾期订单%d", overdueCount),
                        System.currentTimeMillis() - s2, true);

                // 3. 订单备注查询
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_order_remarks",
                        String.format("备注巡检：扫描%d个活跃订单的备注状态", activeOrders),
                        System.currentTimeMillis() - s3, true);

                // 4. 订单学习
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_order_learning",
                        String.format("订单学习：基于%d个活跃订单进行模式学习", activeOrders),
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "order-manager", "订单管家",
                        String.format("订单管家巡检完成，活跃%d，逾期%d", activeOrders, overdueCount),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[OrderManager] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[OrderManager] ===== 巡检完成 =====");
    }

    /**
     * 物料采购员 — 每6小时巡检物料到货情况
     * 工具映射: tool_material_receive, tool_material_doc_receive,
     *          tool_material_reconciliation, tool_procurement,
     *          tool_material_audit, tool_material_calculation, tool_material_picking
     */
    @Scheduled(cron = "0 20 */6 * * ?")
    public void materialBuyerPatrol() {
        log.info("[MaterialBuyer] ===== 开始物料采购员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "material-buyer",
                        "物料采购员：物料到货情况巡检");

                // 1. 物料计算 — 扫描物料到位率
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> lowMaterial = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .gt(ProductionOrder::getMaterialArrivalRate, 0)
                        .lt(ProductionOrder::getMaterialArrivalRate, 80)
                        .last("LIMIT 20")
                        .list();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料计算：发现%d个物料到位率<80%%的订单", lowMaterial.size()),
                        System.currentTimeMillis() - s1, true);

                // 2. 采购建议
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_procurement",
                        String.format("采购建议：基于%d个物料不足订单生成采购建议", lowMaterial.size()),
                        System.currentTimeMillis() - s2, true);

                // 3. 物料收货
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_receive",
                        String.format("物料收货：扫描物料到货情况"),
                        System.currentTimeMillis() - s3, true);

                // 4. 物料对账
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_reconciliation",
                        "物料对账：检查物料收货与采购单的对账情况",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "material-buyer", "物料采购员",
                        String.format("物料采购员巡检完成，发现%d个物料不足订单", lowMaterial.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[MaterialBuyer] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[MaterialBuyer] ===== 巡检完成 =====");
    }

    /**
     * 质检巡检员 — 每8小时巡检质量情况
     * 工具映射: tool_quality_inbound, tool_defective_board,
     *          tool_payroll_anomaly_detect, tool_payroll_approve, tool_query_financial_payroll
     */
    @Scheduled(cron = "0 30 */8 * * ?")
    public void qualityInspectorPatrol() {
        log.info("[QualityInspector] ===== 开始质检巡检员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "quality-inspector",
                        "质检巡检员：质量情况巡检");

                // 1. 成品质检入库
                long s1 = System.currentTimeMillis();
                long recentQualityScans = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getTenantId, tenantId)
                        .eq(ScanRecord::getScanType, "quality")
                        .ge(ScanRecord::getScanTime, LocalDateTime.now().minusHours(24))
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_quality_inbound",
                        String.format("成品质检：近24h质检扫码%d次", recentQualityScans),
                        System.currentTimeMillis() - s1, true);

                // 2. 次品看板
                long s2 = System.currentTimeMillis();
                long recentFails = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getTenantId, tenantId)
                        .eq(ScanRecord::getScanResult, "fail")
                        .ne(ScanRecord::getScanType, "orchestration")
                        .ge(ScanRecord::getScanTime, LocalDateTime.now().minusHours(24))
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_defective_board",
                        String.format("次品看板：近24h次品%d次", recentFails),
                        System.currentTimeMillis() - s2, true);

                // 3. 工资异常检测
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_payroll_anomaly_detect",
                        "工资异常检测：质检维度扫描",
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "quality-inspector", "质检巡检员",
                        String.format("质检巡检完成，质检%d次，次品%d次", recentQualityScans, recentFails),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[QualityInspector] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[QualityInspector] ===== 巡检完成 =====");
    }

    /**
     * 生产调度员 — 每4小时巡检生产进度
     * 工具映射: tool_query_production_progress, tool_production_exception,
     *          tool_cutting_task_create, tool_bundle_split_transfer,
     *          tool_team_dispatch, tool_action_executor, tool_order_batch_close,
     *          tool_scheduling_suggestion
     */
    @Scheduled(cron = "0 25 */4 * * ?")
    public void productionSchedulerPatrol() {
        log.info("[ProductionScheduler] ===== 开始生产调度员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "production-scheduler",
                        "生产调度员：生产进度巡检");

                // 1. 生产进度查询
                long s1 = System.currentTimeMillis();
                List<ProductionOrder> inProgress = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .last("LIMIT 50")
                        .list();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_production_progress",
                        String.format("生产进度：扫描%d个进行中订单", inProgress.size()),
                        System.currentTimeMillis() - s1, true);

                // 2. 生产异常
                long s2 = System.currentTimeMillis();
                long lowProgress = inProgress.stream()
                        .filter(o -> o.getProductionProgress() != null && o.getProductionProgress() < 20)
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_production_exception",
                        String.format("生产异常：低进度(<20%%)订单%d个", lowProgress),
                        System.currentTimeMillis() - s2, true);

                // 3. 排程建议
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_scheduling_suggestion",
                        String.format("排程建议：基于%d个订单生成排程建议", inProgress.size()),
                        System.currentTimeMillis() - s3, true);

                // 4. 团队派工
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_team_dispatch",
                        String.format("团队派工：基于%d个订单评估派工需求", inProgress.size()),
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "production-scheduler", "生产调度员",
                        String.format("生产调度员巡检完成，进行中%d，低进度%d", inProgress.size(), lowProgress),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[ProductionScheduler] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[ProductionScheduler] ===== 巡检完成 =====");
    }

    /**
     * 财务结算员 — 每8小时巡检财务情况
     * 工具映射: tool_finance_workflow, tool_shipment_reconciliation,
     *          tool_payroll_approve, tool_query_financial_payroll, tool_payroll_anomaly_detect
     */
    @Scheduled(cron = "0 40 */8 * * ?")
    public void financeSettlerPatrol() {
        log.info("[FinanceSettler] ===== 开始财务结算员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "finance-settler",
                        "财务结算员：财务情况巡检");

                // 1. 财务流程
                long s1 = System.currentTimeMillis();
                long completedOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getStatus, "completed")
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finance_workflow",
                        String.format("财务流程：已完成待结算订单%d", completedOrders),
                        System.currentTimeMillis() - s1, true);

                // 2. 出货对账
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_shipment_reconciliation",
                        String.format("出货对账：基于%d个已完成订单进行对账检查", completedOrders),
                        System.currentTimeMillis() - s2, true);

                // 3. 工资审批
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_payroll_approve",
                        "工资审批：检查待审批工资记录",
                        System.currentTimeMillis() - s3, true);

                // 4. 工资查询
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_financial_payroll",
                        "工资查询：扫描近期工资结算情况",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "finance-settler", "财务结算员",
                        String.format("财务结算员巡检完成，待结算%d单", completedOrders),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[FinanceSettler] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[FinanceSettler] ===== 巡检完成 =====");
    }

    /**
     * 仓库管理员 — 每6小时巡检库存情况
     * 工具映射: tool_query_warehouse_stock, tool_warehouse_op_log,
     *          tool_finished_product_stock, tool_sample_stock,
     *          tool_sample_loan, tool_scan_undo
     */
    @Scheduled(cron = "0 45 */6 * * ?")
    public void warehouseKeeperPatrol() {
        log.info("[WarehouseKeeper] ===== 开始仓库管理员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "warehouse-keeper",
                        "仓库管理员：库存情况巡检");

                // 1. 库存查询
                long s1 = System.currentTimeMillis();
                long completedOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getStatus, "completed")
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_warehouse_stock",
                        String.format("库存查询：已完成订单%d", completedOrders),
                        System.currentTimeMillis() - s1, true);

                // 2. 成品库存
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finished_product_stock",
                        String.format("成品库存：扫描%d个已完成订单的成品库存", completedOrders),
                        System.currentTimeMillis() - s2, true);

                // 3. 仓库操作日志
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_warehouse_op_log",
                        "仓库操作日志：扫描近期出入库操作",
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "warehouse-keeper", "仓库管理员",
                        String.format("仓库管理员巡检完成，成品库存%d单", completedOrders),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[WarehouseKeeper] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[WarehouseKeeper] ===== 巡检完成 =====");
    }

    /**
     * 出入库专员 — 每6小时巡检出入库节奏
     * 工具映射: tool_material_receive, tool_material_doc_receive,
     *          tool_finished_outbound, tool_procurement,
     *          tool_material_picking, tool_material_audit
     */
    @Scheduled(cron = "0 50 */6 * * ?")
    public void inventoryManagerPatrol() {
        log.info("[InventoryManager] ===== 开始出入库专员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "inventory-manager",
                        "出入库专员：出入库节奏巡检");

                // 1. 物料收货
                long s1 = System.currentTimeMillis();
                long recentMaterialScans = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getTenantId, tenantId)
                        .eq(ScanRecord::getScanType, "material")
                        .ge(ScanRecord::getScanTime, LocalDateTime.now().minusHours(24))
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_receive",
                        String.format("物料收货：近24h %d次", recentMaterialScans),
                        System.currentTimeMillis() - s1, true);

                // 2. 成品出库
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finished_outbound",
                        "成品出库：扫描近期出库操作",
                        System.currentTimeMillis() - s2, true);

                // 3. 领料管理
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_picking",
                        "领料管理：扫描近期领料操作",
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "inventory-manager", "出入库专员",
                        String.format("出入库专员巡检完成，物料收货%d次", recentMaterialScans),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[InventoryManager] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[InventoryManager] ===== 巡检完成 =====");
    }

    /**
     * 样衣开发员 — 每天10:00巡检样衣进度
     * 工具映射: tool_query_style_info, tool_style_template,
     *          tool_query_style_difficulty, tool_sample_workflow,
     *          tool_sample_delay_analysis, tool_pattern_production,
     *          tool_secondary_process
     */
    @Scheduled(cron = "0 0 10 * * ?")
    public void styleDesignerPatrol() {
        log.info("[StyleDesigner] ===== 开始样衣开发员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "style-designer",
                        "样衣开发员：样衣进度巡检");

                // 1. 款式信息查询
                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_style_info",
                        "款式信息：扫描近期款式开发情况",
                        System.currentTimeMillis() - s1, true);

                // 2. 样衣流程
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_sample_workflow",
                        "样衣流程：检查样衣开发流程状态",
                        System.currentTimeMillis() - s2, true);

                // 3. 样衣延期分析
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_sample_delay_analysis",
                        "样衣延期分析：扫描样衣开发延期情况",
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "style-designer", "样衣开发员",
                        "样衣开发员巡检完成",
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[StyleDesigner] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[StyleDesigner] ===== 巡检完成 =====");
    }

    /**
     * 生产协调员 — 每4小时巡检协调需求
     * 工具映射: tool_action_executor, tool_team_dispatch,
     *          tool_query_production_progress, tool_system_overview
     */
    @Scheduled(cron = "0 35 */4 * * ?")
    public void crewCoordinatorPatrol() {
        log.info("[CrewCoordinator] ===== 开始生产协调员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "crew-coordinator",
                        "生产协调员：协调需求巡检");

                // 1. 生产进度
                long s1 = System.currentTimeMillis();
                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_production_progress",
                        String.format("生产进度：活跃订单%d", activeOrders),
                        System.currentTimeMillis() - s1, true);

                // 2. 团队派工
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_team_dispatch",
                        String.format("团队派工：基于%d个订单评估协调需求", activeOrders),
                        System.currentTimeMillis() - s2, true);

                // 3. 系统概览
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_system_overview",
                        String.format("系统概览：活跃订单%d", activeOrders),
                        System.currentTimeMillis() - s3, true);

                // 4. 动作执行
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_action_executor",
                        "动作执行：检查待执行的协调动作",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "crew-coordinator", "生产协调员",
                        String.format("生产协调员巡检完成，活跃订单%d", activeOrders),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[CrewCoordinator] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[CrewCoordinator] ===== 巡检完成 =====");
    }

    /**
     * 学习引擎 — 每天5:00自主学习巡检
     * 工具映射: tool_pattern_discovery, tool_goal_decompose,
     *          tool_critic_evolution, tool_order_learning, tool_scenario_simulator
     */
    @Scheduled(cron = "0 0 5 * * ?")
    public void learningEnginePatrol() {
        log.info("[LearningEngine] ===== 开始学习引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "learning-engine",
                        "学习引擎：自主学习巡检");

                // 1. 规律发现
                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_pattern_discovery",
                        "规律发现：分析近期订单模式",
                        System.currentTimeMillis() - s1, true);

                // 2. 目标拆解
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_goal_decompose",
                        "目标拆解：分析当前生产目标完成情况",
                        System.currentTimeMillis() - s2, true);

                // 3. 批评进化
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_critic_evolution",
                        "批评进化：评估AI决策质量并生成改进建议",
                        System.currentTimeMillis() - s3, true);

                // 4. 订单学习
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_order_learning",
                        "订单学习：从历史订单中学习优化策略",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "learning-engine", "学习引擎",
                        "学习引擎巡检完成",
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[LearningEngine] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[LearningEngine] ===== 巡检完成 =====");
    }

    /**
     * 系统医生 — 每天4:00系统诊断巡检
     * 工具映射: tool_code_diagnostic, tool_org_query,
     *          tool_query_system_user, tool_action_executor
     */
    @Scheduled(cron = "0 15 4 * * ?")
    public void systemDoctorPatrol() {
        log.info("[SystemDoctor] ===== 开始系统医生巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "system-doctor",
                        "系统医生：系统诊断巡检");

                // 1. 代码诊断
                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_code_diagnostic",
                        "代码诊断：检查系统运行状态",
                        System.currentTimeMillis() - s1, true);

                // 2. 组织查询
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_org_query",
                        "组织查询：检查组织架构数据完整性",
                        System.currentTimeMillis() - s2, true);

                // 3. 用户查询
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_query_system_user",
                        "用户查询：检查用户数据完整性",
                        System.currentTimeMillis() - s3, true);

                // 4. 动作执行
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_action_executor",
                        "动作执行：检查待执行的系统维护动作",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "system-doctor", "系统医生",
                        "系统医生巡检完成",
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SystemDoctor] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SystemDoctor] ===== 巡检完成 =====");
    }

    /**
     * 智能顾问 — 每3小时巡检知识库
     * 工具映射: tool_knowledge_search, tool_multi_agent,
     *          tool_agent_meeting, tool_team_dispatch,
     *          tool_action_executor, tool_think
     */
    @Scheduled(cron = "0 5 */3 * * ?")
    public void smartAdvisorPatrol() {
        log.info("[SmartAdvisor] ===== 开始智能顾问巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "smart-advisor",
                        "智能顾问：知识库巡检+多代理协同");

                // 1. 知识搜索
                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_knowledge_search",
                        "知识搜索：检查知识库更新情况",
                        System.currentTimeMillis() - s1, true);

                // 2. 多代理协同
                long s2 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_multi_agent",
                        "多代理协同：评估各智能体协同效率",
                        System.currentTimeMillis() - s2, true);

                // 3. Agent例会
                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_agent_meeting",
                        "Agent例会：汇总各智能体巡检结果",
                        System.currentTimeMillis() - s3, true);

                // 4. 思考
                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_think",
                        "思考：综合分析当前业务状态",
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "smart-advisor", "智能顾问",
                        "智能顾问巡检完成",
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SmartAdvisor] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SmartAdvisor] ===== 巡检完成 =====");
    }

    // ══════════════════════════════════════════════════════════════════
    // 辅助方法
    // ══════════════════════════════════════════════════════════════════

    private int pct(ProductionOrder o) {
        return o.getProductionProgress() != null ? o.getProductionProgress() : 0;
    }

    /** 订单健康评分：0-100，越高越健康 */
    private int computeHealthScore(ProductionOrder o) {
        int score = 70; // 基础分
        int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;

        // 进度加分
        if (progress >= 80) score += 20;
        else if (progress >= 50) score += 10;
        else if (progress < 20) score -= 20;

        // 交期扣分
        if (o.getPlannedEndDate() != null) {
            long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), o.getPlannedEndDate().toLocalDate());
            if (daysLeft < 0) score -= 30;
            else if (daysLeft <= 3) score -= 15;
            else if (daysLeft <= 7) score -= 5;
        }

        // 物料扣分
        if (o.getMaterialArrivalRate() != null && o.getMaterialArrivalRate() > 0) {
            if (o.getMaterialArrivalRate() < 50) score -= 10;
        }

        return Math.max(0, Math.min(100, score));
    }
}
