package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
public class SystemDataMiner {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AiInferenceGateway inferenceGateway;

    public record DataSnapshot(
            String category,
            List<Map<String, Object>> rows,
            Map<String, Object> stats,
            LocalDateTime minedAt
    ) {}

    public record ScenarioGenerationResult(
            List<String> scenarios,
            Map<String, String> domainContext,
            int totalGenerated,
            LocalDateTime generatedAt
    ) {}

    public DataSnapshot mineProductionOrders(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT order_no, factory_name, planned_end_date, status, progress_percent, "
                        + "delay_days, production_stage, remarks "
                        + "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0 "
                        + "ORDER BY create_time DESC LIMIT 100", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalOrders", rows.size());
        stats.put("delayedCount", rows.stream().filter(r -> toInt(r.get("delay_days")) > 0).count());
        stats.put("onTimeCount", rows.stream().filter(r -> toInt(r.get("delay_days")) <= 0).count());
        stats.put("avgDelayDays", rows.stream().mapToInt(r -> toInt(r.get("delay_days"))).average().orElse(0));
        stats.put("factories", rows.stream().map(r -> r.get("factory_name")).filter(Objects::nonNull).distinct().count());
        stats.put("stages", rows.stream().map(r -> r.get("production_stage")).filter(Objects::nonNull).distinct().count());

        return new DataSnapshot("production_order", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineScanRecords(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT sr.order_id, sr.process_name, sr.scan_qty, sr.scan_time, "
                        + "sr.worker_name, sr.factory_name, sr.quality_status "
                        + "FROM t_scan_record sr WHERE sr.tenant_id = ? "
                        + "ORDER BY sr.scan_time DESC LIMIT 200", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalScans", rows.size());
        stats.put("defectiveScans", rows.stream().filter(r -> "DEFECTIVE".equals(r.get("quality_status"))).count());
        stats.put("processTypes", rows.stream().map(r -> r.get("process_name")).filter(Objects::nonNull).distinct().count());
        stats.put("workers", rows.stream().map(r -> r.get("worker_name")).filter(Objects::nonNull).distinct().count());

        return new DataSnapshot("scan_record", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineMaterialPurchases(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT order_no, material_name, supplier, purchase_qty, arrived_qty, "
                        + "status, planned_arrival_date, actual_arrival_date "
                        + "FROM t_material_purchase WHERE tenant_id = ? AND delete_flag = 0 "
                        + "ORDER BY create_time DESC LIMIT 100", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalPurchases", rows.size());
        stats.put("delayedArrivals", rows.stream()
                .filter(r -> r.get("actual_arrival_date") != null && r.get("planned_arrival_date") != null)
                .filter(r -> r.get("actual_arrival_date").toString().compareTo(r.get("planned_arrival_date").toString()) > 0)
                .count());
        stats.put("pendingPurchases", rows.stream().filter(r -> "PENDING".equals(r.get("status"))).count());

        return new DataSnapshot("material_purchase", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineQualityIssues(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT order_id, process_name, defect_type, defect_qty, report_time, "
                        + "factory_name, worker_name, status "
                        + "FROM t_quality_issue WHERE tenant_id = ? AND delete_flag = 0 "
                        + "ORDER BY report_time DESC LIMIT 100", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalIssues", rows.size());
        stats.put("unresolvedIssues", rows.stream().filter(r -> !"RESOLVED".equals(r.get("status"))).count());
        stats.put("defectTypes", rows.stream().map(r -> r.get("defect_type")).filter(Objects::nonNull).distinct().count());

        return new DataSnapshot("quality_issue", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineFinanceRecords(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT order_id, payment_type, amount, payment_status, due_date, "
                        + "actual_payment_date, factory_name "
                        + "FROM t_finance_record WHERE tenant_id = ? AND delete_flag = 0 "
                        + "ORDER BY create_time DESC LIMIT 100", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalRecords", rows.size());
        stats.put("overduePayments", rows.stream()
                .filter(r -> "OVERDUE".equals(r.get("payment_status"))).count());
        stats.put("totalAmount", rows.stream()
                .mapToDouble(r -> toDouble(r.get("amount"))).sum());

        return new DataSnapshot("finance_record", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineFactoryPerformance(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT factory_name, completed_orders, delayed_orders, avg_delay_days, "
                        + "quality_score, on_time_rate "
                        + "FROM t_factory_performance WHERE tenant_id = ? "
                        + "ORDER BY completed_orders DESC LIMIT 50", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalFactories", rows.size());
        stats.put("avgOnTimeRate", rows.stream()
                .mapToDouble(r -> toDouble(r.get("on_time_rate"))).average().orElse(0));
        stats.put("avgQualityScore", rows.stream()
                .mapToDouble(r -> toDouble(r.get("quality_score"))).average().orElse(0));

        return new DataSnapshot("factory_performance", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineAgentExecutionLogs(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT tool_name, avg_feedback, success_count, fail_count, "
                        + "avg_duration_ms, last_executed "
                        + "FROM t_agent_execution_log WHERE tenant_id = ? "
                        + "ORDER BY avg_feedback ASC LIMIT 30", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalTools", rows.size());
        stats.put("lowFeedbackTools", rows.stream()
                .filter(r -> toDouble(r.get("avg_feedback")) < 3.5).count());
        stats.put("highFailTools", rows.stream()
                .filter(r -> toInt(r.get("fail_count")) > toInt(r.get("success_count"))).count());

        return new DataSnapshot("agent_execution", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineReflectionPool(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT conversation_id, quality_score, reflection_content, prompt_suggestion, "
                        + "reflection_type, create_time "
                        + "FROM t_conversation_reflection WHERE tenant_id = ? AND resolved = 0 "
                        + "ORDER BY quality_score ASC LIMIT 50", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalReflections", rows.size());
        stats.put("avgQualityScore", rows.stream()
                .mapToDouble(r -> toDouble(r.get("quality_score"))).average().orElse(0));
        stats.put("lowQualityCount", rows.stream()
                .filter(r -> toDouble(r.get("quality_score")) < 0.6).count());
        stats.put("hasSuggestions", rows.stream()
                .filter(r -> r.get("prompt_suggestion") != null
                        && !r.get("prompt_suggestion").toString().isBlank()).count());

        return new DataSnapshot("reflection_pool", rows, stats, LocalDateTime.now());
    }

    public DataSnapshot mineAutoFeedback(Long tenantId) {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT suggestion_type, feedback_result, feedback_reason, "
                        + "feedback_analysis, deviation_minutes, create_time "
                        + "FROM t_intelligence_feedback WHERE tenant_id = ? "
                        + "AND feedback_result = 'rejected' "
                        + "ORDER BY create_time DESC LIMIT 30", tenantId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalRejected", rows.size());
        stats.put("problemTypes", rows.stream()
                .map(r -> r.get("suggestion_type")).filter(Objects::nonNull).distinct().count());
        stats.put("avgDeviation", rows.stream()
                .mapToInt(r -> toInt(r.get("deviation_minutes"))).average().orElse(0));

        return new DataSnapshot("auto_feedback", rows, stats, LocalDateTime.now());
    }

    public ScenarioGenerationResult generatePracticeScenarios(Long tenantId) {
        List<DataSnapshot> snapshots = List.of(
                mineProductionOrders(tenantId),
                mineScanRecords(tenantId),
                mineMaterialPurchases(tenantId),
                mineQualityIssues(tenantId),
                mineReflectionPool(tenantId),
                mineAutoFeedback(tenantId),
                mineAgentExecutionLogs(tenantId)
        );

        Map<String, String> domainContext = buildDomainContext(snapshots);

        String synthesisPrompt = buildSynthesisPrompt(snapshots, domainContext);

        List<String> scenarios;
        try {
            IntelligenceInferenceResult result = inferenceGateway.chat(
                    "scenario-generator", List.of(
                            com.fashion.supplychain.intelligence.agent.AiMessage.system(synthesisPrompt),
                            com.fashion.supplychain.intelligence.agent.AiMessage.user(
                                    "基于以上全部系统真实数据，生成8个高质量自我推演场景。"
                                            + "每个场景必须包含：问题描述、已知上下文数据、预期难度（低/中/高）、"
                                            + "对应薄弱点。场景必须基于真实数据分布，覆盖不同难度和领域。")
                    ), Collections.emptyList());

            scenarios = parseScenariosFromLlm(result != null ? result.getContent() : "");
        } catch (Exception e) {
            log.warn("[SystemDataMiner] LLM场景生成失败，使用规则兜底: {}", e.getMessage());
            scenarios = generateRuleBasedScenarios(snapshots, domainContext);
        }

        log.info("[SystemDataMiner] 租户{} 从{}条数据中生成{}个推演场景",
                tenantId, snapshots.stream().mapToInt(s -> s.rows().size()).sum(), scenarios.size());

        return new ScenarioGenerationResult(scenarios, domainContext, scenarios.size(), LocalDateTime.now());
    }

    private Map<String, String> buildDomainContext(List<DataSnapshot> snapshots) {
        Map<String, String> ctx = new LinkedHashMap<>();

        for (DataSnapshot s : snapshots) {
            ctx.put(s.category() + "_rowCount", String.valueOf(s.rows().size()));
            s.stats().forEach((k, v) -> ctx.put(s.category() + "_" + k, String.valueOf(v)));
        }

        return ctx;
    }

    private String buildSynthesisPrompt(List<DataSnapshot> snapshots, Map<String, String> domainContext) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是服装供应链AI系统的自我进化引擎。以下是从系统全部真实数据中挖掘的模式摘要。\n\n");
        sb.append("=== 系统数据全景 ===\n");

        for (DataSnapshot s : snapshots) {
            sb.append("【").append(s.category()).append("】\n");
            sb.append("统计: ").append(s.stats()).append("\n");
            sb.append("样本(前3条):\n");
            s.rows().stream().limit(3).forEach(row -> {
                sb.append("  ").append(row).append("\n");
            });
            sb.append("\n");
        }

        sb.append("=== 已识别的薄弱点 ===\n");
        sb.append("从 t_conversation_reflection + t_intelligence_feedback 中提取的常见失败模式：\n");
        snapshots.stream()
                .filter(s -> "reflection_pool".equals(s.category()) || "auto_feedback".equals(s.category()))
                .flatMap(s -> s.rows().stream().limit(5))
                .forEach(row -> {
                    sb.append("- 评分=").append(row.getOrDefault("quality_score", "N/A"))
                            .append(" 问题=").append(row.getOrDefault("feedback_reason", ""))
                            .append("\n");
                });

        sb.append("\n=== 领域上下文 ===\n");
        sb.append(domainContext).append("\n");

        sb.append("\n你的任务：基于以上全部真实数据，生成高质量自我推演场景。");
        sb.append("每个场景输出格式：\n---SCENARIO---\n");
        sb.append("难度: [低/中/高]\n");
        sb.append("领域: [production/material/quality/finance/system]\n");
        sb.append("针对薄弱点: [从反思池中匹配的具体问题]\n");
        sb.append("用户角色: [跟单/财务/管理员/工厂主管]\n");
        sb.append("问题: [自然语言用户提问]\n");
        sb.append("已知上下文: [提供哪些数据给AI]\n");
        sb.append("预期调用的工具: [逗号分隔]\n");
        sb.append("成功标准: [什么是好的回答]\n");

        return sb.toString();
    }

    private List<String> parseScenariosFromLlm(String llmResponse) {
        if (llmResponse == null || llmResponse.isBlank()) return List.of();

        List<String> scenarios = new ArrayList<>();
        String[] parts = llmResponse.split("---SCENARIO---");
        for (int i = 1; i < parts.length; i++) {
            String trimmed = parts[i].trim();
            if (!trimmed.isEmpty() && trimmed.length() > 20) {
                scenarios.add(trimmed);
            }
        }

        return scenarios.isEmpty() ? List.of() : scenarios;
    }

    private List<String> generateRuleBasedScenarios(List<DataSnapshot> snapshots,
                                                     Map<String, String> domainContext) {
        List<String> scenarios = new ArrayList<>();

        snapshots.stream()
                .filter(s -> "production_order".equals(s.category()))
                .flatMap(s -> s.rows().stream().limit(5))
                .forEach(row -> {
                    String orderNo = str(row.get("order_no"));
                    String factory = str(row.get("factory_name"));
                    long delayed = toLong(row.get("delay_days"));
                    if (delayed > 0 && !orderNo.isBlank()) {
                        scenarios.add(String.format(
                                "难度: 中\n领域: production\n针对薄弱点: 延期原因分析不深入\n"
                                        + "问题: 订单%s在%s延期了%d天，帮我分析具体原因并给出处理建议。\n"
                                        + "已知上下文: 工厂=%s, 延期=%d天, 阶段=%s\n"
                                        + "成功标准: 列出工具查到的事实→推断原因→给出可执行建议",
                                orderNo, factory, delayed, factory, delayed,
                                str(row.get("production_stage"))));
                    }
                });

        long totalIssues = toLong(domainContext.getOrDefault("quality_issue_totalIssues", "0"));
        if (totalIssues > 0) {
            scenarios.add(
                    "难度: 高\n领域: quality\n针对薄弱点: 质量问题根因分析\n"
                            + "问题: 最近工厂的次品率持续上升，帮我找出是哪个环节、哪个工人原因最大，给出改进方案。\n"
                            + "已知上下文: 全系统有" + totalIssues + "条质量记录\n"
                            + "成功标准: 按工厂/工序/工人维度分析→排序→针对性建议");
        }

        long delayedPurchases = toLong(
                domainContext.getOrDefault("material_purchase_delayedArrivals", "0"));
        if (delayedPurchases > 0) {
            scenarios.add(
                    "难度: 中\n领域: material\n针对薄弱点: 物料延迟对生产的影响分析\n"
                            + "问题: 有" + delayedPurchases + "批物料到货延迟了，"
                            + "帮我看看这些延迟会不会导致生产订单延期？哪些订单最危险？\n"
                            + "成功标准: 关联物料延迟和订单交期→标记高危订单→建议优先催货");
        }

        scenarios.add(
                "难度: 低\n领域: system\n针对薄弱点: 上下文利用率低\n"
                        + "问题: 帮我总结一下今天工厂的整体运行情况，有哪些需要我特别关注的事情。\n"
                        + "成功标准: 从多个数据源综合汇总→识别异常→给出优先级");

        return scenarios;
    }

    private List<Map<String, Object>> safeQuery(String sql, Object... params) {
        try {
            return jdbc.queryForList(sql, params);
        } catch (Exception e) {
            log.debug("[SystemDataMiner] 查询失败(表可能不存在): {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private String str(Object val) {
        return val != null ? val.toString() : "";
    }

    private int toInt(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.intValue();
        try { return Integer.parseInt(val.toString()); } catch (NumberFormatException e) { return 0; }
    }

    private long toLong(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.longValue();
        try { return Long.parseLong(val.toString()); } catch (NumberFormatException e) { return 0; }
    }

    private double toDouble(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (NumberFormatException e) { return 0; }
    }
}
