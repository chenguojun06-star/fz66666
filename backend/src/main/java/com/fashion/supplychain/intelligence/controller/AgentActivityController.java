package com.fashion.supplychain.intelligence.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.entity.IntelligenceSignal;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.intelligence.mapper.IntelligenceSignalMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/intelligence/agent-activity")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class AgentActivityController {

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    @Autowired
    private IntelligenceSignalMapper signalMapper;

    private static final List<AgentDefinition> AGENT_DEFINITIONS = List.of(
            new AgentDefinition("order-manager", "订单管家", "production", "#1677ff",
                    "管理生产订单全生命周期：创建、编辑、转厂、催单、学习、对比"),
            new AgentDefinition("material-buyer", "物料采购员", "production", "#52c41a",
                    "面辅料采购：到货入库、领料、对账、采购单管理、供应商管理"),
            new AgentDefinition("quality-inspector", "质检巡检员", "production", "#faad14",
                    "成品质检入库、次品返修报废、工资异常检测"),
            new AgentDefinition("production-scheduler", "生产调度员", "production", "#ff7a45",
                    "生产进度查询、异常上报、裁剪单创建、拆菲转派"),
            new AgentDefinition("finance-settler", "财务结算员", "finance", "#eb2f96",
                    "财务审批付款、工资结算审批、出货对账、发票管理、税务配置"),
            new AgentDefinition("warehouse-keeper", "仓库管理员", "warehouse", "#722ed1",
                    "库存管理：物料库存查询、成品库存、样衣借还、盘点、操作日志"),
            new AgentDefinition("inventory-manager", "出入库专员", "warehouse", "#fa8c16",
                    "出入库操作：面辅料收货入库、成品出库、采购到货、领料管理"),
            new AgentDefinition("style-designer", "样衣开发员", "basic", "#13c2c2",
                    "样衣开发与纸样管理：款式建档、模板、难度评估、报价、二次加工"),
            new AgentDefinition("data-analyst", "数据分析师", "intelligence", "#fa541c",
                    "深度分析、延期趋势、供应商评分、智能报表、管理看板、系统概览"),
            new AgentDefinition("risk-sentinel", "风险哨兵", "intelligence", "#f5222d",
                    "根因分析、人员延期分析、变更审批、生产异常上报"),
            new AgentDefinition("smart-advisor", "智能顾问", "intelligence", "#2f54eb",
                    "AI对话：知识搜索、多代理协同、Agent例会、团队分派"),
            new AgentDefinition("learning-engine", "学习引擎", "intelligence", "#52c41a",
                    "自主学习：规律发现、目标拆解、Critic进化、场景模拟、自我优化"),
            new AgentDefinition("system-doctor", "系统医生", "intelligence", "#9254de",
                    "系统诊断与自愈：代码诊断、组织查询、用户管理、字典维护"),
            new AgentDefinition("patrol-sentinel", "巡逻哨兵", "intelligence", "#e65100",
                    "自动巡检：逾期扫描、停滞检测、主动诊断、智能备注推送"),
            new AgentDefinition("sourcing-specialist", "采购专家", "intelligence", "#00897b",
                    "BOM成本分析、供应商交付评估、物料缺口识别"),
            new AgentDefinition("delivery-specialist", "交付专家", "intelligence", "#d84315",
                    "交付风险评估、订单健康评分、逾期预警"),
            new AgentDefinition("compliance-specialist", "合规专家", "intelligence", "#6a1b9a",
                    "质量合格率分析、缺陷追踪、DPP合规检查"),
            new AgentDefinition("logistics-specialist", "物流专家", "intelligence", "#1565c0",
                    "库存水位分析、出入库节奏、物流延迟风险"),
            new AgentDefinition("crew-coordinator", "生产协调员", "production", "#00838f",
                    "自然语言命令解析、批量生产建议、订单只读分析"),
            new AgentDefinition("evolution-engine", "进化引擎", "intelligence", "#ad1457",
                    "GitHub技术研究、反馈驱动进化、自我优化提案"),
            new AgentDefinition("insight-generator", "洞察生成器", "intelligence", "#00695c",
                    "每日洞察简报、晨报生成、业务趋势分析"),
            new AgentDefinition("smart-remark", "智能备注员", "intelligence", "#5d4037",
                    "自动备注：订单备注巡检、智能备注推送、异常标记"),
            new AgentDefinition("critic-agent", "批评检查官", "intelligence", "#4e342e",
                    "审查AI输出：数据溯源校验、逻辑一致性检查、遗漏检测"),
            new AgentDefinition("hyper-advisor", "超级顾问", "intelligence", "#1a237e",
                    "深度推演、风险模拟、知识收割、安全建议"),
            new AgentDefinition("forecast-engine", "预测引擎", "intelligence", "#0d47a1",
                    "交付预测：交期建议、销售预测、进度预测"),
            new AgentDefinition("visual-ai", "视觉AI", "intelligence", "#311b92",
                    "图像分析：图片识别、文件分析、视觉质检"),
            new AgentDefinition("voice-command", "语音指令", "intelligence", "#4a148c",
                    "语音交互：语音命令解析、语音转文字、语音操作"),
            new AgentDefinition("self-healing", "自愈引擎", "intelligence", "#b71c1c",
                    "数据修复：一致性诊断、自动修复、孤儿数据检测"),
            new AgentDefinition("intelligence-brain", "智能中枢", "intelligence", "#1b5e20",
                    "大脑快照：健康度聚合、风险脉搏、异常感知、学习闭环"),
            new AgentDefinition("anomaly-detector", "异常检测器", "intelligence", "#880e4f",
                    "异常检测：对账异常、工厂瓶颈、物料短缺、停滞预警")
    );

    private static final Map<String, List<String>> DOMAIN_TOOLS = Map.ofEntries(
            Map.entry("order-manager", List.of("tool_order_edit", "tool_order_contact_urge",
                    "tool_order_factory_transfer", "tool_order_factory_transfer_undo",
                    "tool_order_learning", "tool_query_order_remarks",
                    "tool_create_production_order", "tool_simulate_new_order",
                    "tool_query_crm_customer")),
            Map.entry("material-buyer", List.of("tool_material_receive", "tool_material_doc_receive",
                    "tool_material_reconciliation", "tool_procurement",
                    "tool_material_audit", "tool_material_calculation",
                    "tool_material_picking")),
            Map.entry("quality-inspector", List.of("tool_quality_inbound", "tool_defective_board",
                    "tool_payroll_anomaly_detect", "tool_payroll_approve",
                    "tool_query_financial_payroll")),
            Map.entry("production-scheduler", List.of("tool_query_production_progress", "tool_production_exception",
                    "tool_cutting_task_create", "tool_bundle_split_transfer",
                    "tool_team_dispatch", "tool_action_executor", "tool_order_batch_close")),
            Map.entry("finance-settler", List.of("tool_finance_workflow", "tool_shipment_reconciliation",
                    "tool_payroll_approve", "tool_query_financial_payroll",
                    "tool_payroll_anomaly_detect")),
            Map.entry("warehouse-keeper", List.of("tool_query_warehouse_stock", "tool_warehouse_op_log",
                    "tool_finished_product_stock", "tool_sample_stock",
                    "tool_sample_loan", "tool_scan_undo")),
            Map.entry("inventory-manager", List.of("tool_material_receive", "tool_material_doc_receive",
                    "tool_finished_outbound", "tool_procurement",
                    "tool_material_picking", "tool_material_audit")),
            Map.entry("style-designer", List.of("tool_query_style_info", "tool_style_template",
                    "tool_query_style_difficulty", "tool_sample_workflow",
                    "tool_sample_delay_analysis", "tool_pattern_production",
                    "tool_secondary_process")),
            Map.entry("data-analyst", List.of("tool_deep_analysis", "tool_delay_trend",
                    "tool_supplier_scorecard", "tool_smart_report",
                    "tool_system_overview", "tool_scenario_simulator",
                    "tool_whatif")),
            Map.entry("risk-sentinel", List.of("tool_root_cause_analysis", "tool_personnel_delay_analysis",
                    "tool_change_approval", "tool_production_exception",
                    "tool_order_contact_urge", "scanOverdue", "scanStagnant",
                    "smartRemark", "proactiveDiagnose")),
            Map.entry("smart-advisor", List.of("tool_knowledge_search", "tool_multi_agent",
                    "tool_agent_meeting", "tool_team_dispatch",
                    "tool_action_executor", "tool_think")),
            Map.entry("learning-engine", List.of("tool_pattern_discovery", "tool_goal_decompose",
                    "tool_critic_evolution", "tool_order_learning",
                    "tool_scenario_simulator")),
            Map.entry("system-doctor", List.of("tool_code_diagnostic", "tool_org_query",
                    "tool_query_system_user", "tool_action_executor")),
            Map.entry("patrol-sentinel", List.of("scanOverdue", "scanStagnant",
                    "smartRemark", "proactiveDiagnose", "tool_production_exception",
                    "tool_order_contact_urge")),
            Map.entry("sourcing-specialist", List.of("tool_material_calculation",
                    "tool_supplier_scorecard", "tool_procurement", "tool_supplier")),
            Map.entry("delivery-specialist", List.of("tool_delay_trend",
                    "tool_system_overview", "tool_deep_analysis", "tool_query_production_progress")),
            Map.entry("compliance-specialist", List.of("tool_quality_inbound",
                    "tool_defective_board", "tool_payroll_anomaly_detect")),
            Map.entry("logistics-specialist", List.of("tool_query_warehouse_stock",
                    "tool_finished_product_stock", "tool_material_receive",
                    "tool_finished_outbound")),
            Map.entry("crew-coordinator", List.of("tool_action_executor",
                    "tool_team_dispatch", "tool_query_production_progress",
                    "tool_system_overview")),
            Map.entry("evolution-engine", List.of("tool_critic_evolution",
                    "tool_ai_self_optimize_report", "tool_pattern_discovery")),
            Map.entry("insight-generator", List.of("tool_smart_report",
                    "tool_system_overview", "tool_deep_analysis", "tool_delay_trend")),
            Map.entry("smart-remark", List.of("smartRemark", "tool_query_order_remarks")),
            Map.entry("critic-agent", List.of("tool_critic_evolution", "tool_think")),
            Map.entry("hyper-advisor", List.of("tool_whatif", "tool_scenario_simulator",
                    "tool_deep_analysis", "tool_knowledge_search")),
            Map.entry("forecast-engine", List.of("tool_system_overview",
                    "tool_smart_report", "tool_delay_trend", "tool_whatif")),
            Map.entry("visual-ai", List.of("tool_query_style_info",
                    "tool_quality_inbound", "tool_defective_board")),
            Map.entry("voice-command", List.of("tool_action_executor", "tool_think")),
            Map.entry("self-healing", List.of("tool_code_diagnostic", "tool_org_query")),
            Map.entry("intelligence-brain", List.of("tool_system_overview",
                    "tool_deep_analysis", "tool_smart_report")),
            Map.entry("anomaly-detector", List.of("tool_production_exception",
                    "tool_material_calculation", "tool_delay_trend",
                    "tool_payroll_anomaly_detect"))
    );

    @GetMapping("/agents")
    public Result<List<Map<String, Object>>> getAgentList() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusHours(24);

        Map<String, AgentActivityStats> statsMap = batchComputeAgentStats(tenantId, since);

        List<Map<String, Object>> agents = new ArrayList<>();
        for (AgentDefinition def : AGENT_DEFINITIONS) {
            Map<String, Object> agent = new LinkedHashMap<>();
            agent.put("id", def.id);
            agent.put("name", def.name);
            agent.put("department", def.department);
            agent.put("color", def.color);
            agent.put("description", def.description);

            AgentActivityStats stats = statsMap.getOrDefault(def.id, new AgentActivityStats());
            agent.put("status", stats.currentStatus);
            agent.put("lastActivity", stats.lastActivity);
            agent.put("tasksToday", stats.tasksToday);
            agent.put("successRate", stats.successRate);
            agent.put("avgDurationMs", stats.avgDurationMs);
            agent.put("intelligenceScore", stats.intelligenceScore);
            agent.put("lazinessScore", stats.lazinessScore);
            agent.put("currentTask", stats.currentTask);
            agent.put("position", stats.position);

            agents.add(agent);
        }
        return Result.success(agents);
    }

    @GetMapping("/agents/{agentId}/trajectory")
    public Result<List<Map<String, Object>>> getAgentTrajectory(
            @PathVariable String agentId,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (startTime == null) startTime = LocalDateTime.now().minusHours(24);
        if (endTime == null) endTime = LocalDateTime.now();

        List<String> tools = DOMAIN_TOOLS.getOrDefault(agentId, List.of());
        if (tools.isEmpty()) return Result.success(List.of());

        List<Map<String, Object>> trajectory = new ArrayList<>();
        try {
            QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId)
                 .ge("created_at", startTime)
                 .le("created_at", endTime)
                 .orderByAsc("created_at")
                 .last("LIMIT 200");

            List<IntelligenceAuditLog> logs = auditLogMapper.selectList(query);
            int step = 0;
            for (IntelligenceAuditLog logEntry : logs) {
                String action = logEntry.getAction() != null ? logEntry.getAction() : "";
                boolean matches = tools.stream().anyMatch(action::contains);
                if (!matches && !"ai-agent:request".equals(action)) continue;

                Map<String, Object> point = new LinkedHashMap<>();
                point.put("time", logEntry.getCreatedAt() != null ? logEntry.getCreatedAt().toString() : null);
                point.put("action", action);
                point.put("status", logEntry.getStatus());
                point.put("durationMs", logEntry.getDurationMs());
                point.put("targetId", logEntry.getTargetId());
                point.put("summary", logEntry.getRemark());
                point.put("step", step++);

                String domain = resolveDomain(action);
                point.put("domain", domain);
                point.put("position", computePosition(domain, step));

                trajectory.add(point);
            }
        } catch (Exception e) {
            log.warn("[AgentActivity] 查询轨迹失败 agentId={}: {}", agentId, e.getMessage());
        }
        return Result.success(trajectory);
    }

    @GetMapping("/departments")
    public Result<List<Map<String, Object>>> getDepartmentStats() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusHours(24);

        Map<String, AgentActivityStats> statsMap = batchComputeAgentStats(tenantId, since);

        Map<String, String> deptNames = Map.of(
                "production", "生产管理部",
                "finance", "财务管理部",
                "warehouse", "仓储管理部",
                "basic", "基础业务部",
                "intelligence", "智能运营部"
        );

        List<Map<String, Object>> departments = new ArrayList<>();
        for (Map.Entry<String, String> entry : deptNames.entrySet()) {
            String deptCode = entry.getKey();
            Map<String, Object> dept = new LinkedHashMap<>();
            dept.put("code", deptCode);
            dept.put("name", entry.getValue());

            List<AgentDefinition> deptAgents = AGENT_DEFINITIONS.stream()
                    .filter(a -> deptCode.equals(a.department))
                    .collect(Collectors.toList());
            dept.put("agentCount", deptAgents.size());
            dept.put("agentIds", deptAgents.stream().map(a -> a.id).collect(Collectors.toList()));

            int totalTasks = 0;
            int successTasks = 0;
            for (AgentDefinition agent : deptAgents) {
                AgentActivityStats stats = statsMap.getOrDefault(agent.id, new AgentActivityStats());
                totalTasks += stats.tasksToday;
                successTasks += (int) Math.round(stats.tasksToday * stats.successRate / 100.0);
            }
            dept.put("totalTasks", totalTasks);
            dept.put("successRate", totalTasks > 0 ? Math.round(successTasks * 100.0 / totalTasks) : 0);
            departments.add(dept);
        }
        return Result.success(departments);
    }

    @GetMapping("/alerts")
    public Result<List<Map<String, Object>>> getAlerts() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> alerts = new ArrayList<>();

        try {
            QueryWrapper<IntelligenceSignal> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId)
                 .eq("status", "open")
                 .orderByDesc("priority_score")
                 .last("LIMIT 20");
            List<IntelligenceSignal> signals = signalMapper.selectList(query);

            for (IntelligenceSignal signal : signals) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("id", signal.getId());
                alert.put("type", signal.getSignalType());
                alert.put("code", signal.getSignalCode());
                alert.put("level", signal.getSignalLevel());
                alert.put("title", signal.getSignalTitle());
                alert.put("detail", signal.getSignalDetail());
                alert.put("priority", signal.getPriorityScore());
                alert.put("domain", signal.getSourceDomain());
                alert.put("time", signal.getCreateTime() != null ? signal.getCreateTime().toString() : null);
                alerts.add(alert);
            }
        } catch (Exception e) {
            log.warn("[AgentActivity] 查询告警失败: {}", e.getMessage());
        }
        return Result.success(alerts);
    }

    private Map<String, AgentActivityStats> batchComputeAgentStats(Long tenantId, LocalDateTime since) {
        Map<String, AgentActivityStats> result = new LinkedHashMap<>();
        try {
            QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId)
                 .ge("created_at", since)
                 .orderByDesc("created_at")
                 .last("LIMIT 500");
            List<IntelligenceAuditLog> allLogs = auditLogMapper.selectList(query);

            Map<String, List<IntelligenceAuditLog>> logsByAgent = new LinkedHashMap<>();
            for (IntelligenceAuditLog logEntry : allLogs) {
                String action = logEntry.getAction() != null ? logEntry.getAction() : "";
                for (Map.Entry<String, List<String>> entry : DOMAIN_TOOLS.entrySet()) {
                    boolean matches = entry.getValue().stream().anyMatch(action::contains) || "ai-agent:request".equals(action);
                    if (matches) {
                        logsByAgent.computeIfAbsent(entry.getKey(), k -> new ArrayList<>()).add(logEntry);
                        break;
                    }
                }
            }

            for (AgentDefinition def : AGENT_DEFINITIONS) {
                List<IntelligenceAuditLog> agentLogs = logsByAgent.getOrDefault(def.id, Collections.emptyList());
                result.put(def.id, computeStatsFromLogs(def.id, agentLogs));
            }
        } catch (Exception e) {
            log.warn("[AgentActivity] 批量计算智能体统计失败: {}", e.getMessage());
            for (AgentDefinition def : AGENT_DEFINITIONS) {
                AgentActivityStats stats = new AgentActivityStats();
                stats.currentStatus = "unknown";
                stats.position = computePosition("intelligence", 0);
                result.put(def.id, stats);
            }
        }
        return result;
    }

    private AgentActivityStats computeStatsFromLogs(String agentId, List<IntelligenceAuditLog> logs) {
        AgentActivityStats stats = new AgentActivityStats();
        int totalTasks = 0;
        int successTasks = 0;
        long totalDuration = 0;
        int durationCount = 0;
        LocalDateTime lastActivity = null;
        String currentTask = null;
        String currentStatus = "idle";

        for (IntelligenceAuditLog logEntry : logs) {
            totalTasks++;
            if ("SUCCESS".equals(logEntry.getStatus())) successTasks++;
            if (logEntry.getDurationMs() != null && logEntry.getDurationMs() > 0) {
                totalDuration += logEntry.getDurationMs();
                durationCount++;
            }
            if (lastActivity == null && logEntry.getCreatedAt() != null) {
                lastActivity = logEntry.getCreatedAt();
            }
            if ("EXECUTING".equals(logEntry.getStatus()) && currentTask == null) {
                currentTask = logEntry.getRemark() != null ? logEntry.getRemark() : logEntry.getAction();
                currentStatus = "working";
            }
        }

        if (currentStatus.equals("idle") && lastActivity != null) {
            long minutesSinceLast = ChronoUnit.MINUTES.between(lastActivity, LocalDateTime.now());
            if (minutesSinceLast < 5) currentStatus = "idle_recent";
            else if (minutesSinceLast < 30) currentStatus = "idle";
            else currentStatus = "sleeping";
        }

        stats.currentStatus = currentStatus;
        stats.lastActivity = lastActivity != null ? lastActivity.toString() : null;
        stats.tasksToday = totalTasks;
        stats.successRate = totalTasks > 0 ? Math.round(successTasks * 100.0 / totalTasks) : 100;
        stats.avgDurationMs = durationCount > 0 ? totalDuration / durationCount : 0;
        stats.currentTask = currentTask;

        long idleMinutes = lastActivity != null ? ChronoUnit.MINUTES.between(lastActivity, LocalDateTime.now()) : 999;
        stats.lazinessScore = Math.min(100, (int) (idleMinutes / 6.0));
        stats.intelligenceScore = Math.min(100, (int) (stats.successRate * 0.6 + Math.max(0, 100 - stats.lazinessScore) * 0.4));

        String domain = AGENT_DEFINITIONS.stream()
                .filter(a -> a.id.equals(agentId))
                .map(a -> a.department)
                .findFirst().orElse("intelligence");
        stats.position = computePosition(domain, totalTasks);

        return stats;
    }

    private String resolveDomain(String action) {
        if (action == null) return "intelligence";
        if (action.contains("order") || action.contains("team_dispatch") || action.contains("production"))
            return "production";
        if (action.contains("material") || action.contains("purchase") || action.contains("reconciliation"))
            return "production";
        if (action.contains("finance") || action.contains("payment") || action.contains("expense"))
            return "finance";
        if (action.contains("warehouse") || action.contains("inventory") || action.contains("sample_loan"))
            return "warehouse";
        if (action.contains("style") || action.contains("sample") || action.contains("pattern"))
            return "basic";
        return "intelligence";
    }

    private Map<String, Integer> computePosition(String domain, int step) {
        Map<String, Double> basePositions = Map.of(
                "production", 25.0,
                "finance", 50.0,
                "warehouse", 75.0,
                "basic", 15.0,
                "intelligence", 55.0
        );
        double baseX = basePositions.getOrDefault(domain, 50.0);
        double baseY = 30.0 + (domain.hashCode() % 40);
        double offsetX = Math.sin(step * 0.7) * 8;
        double offsetY = Math.cos(step * 0.5) * 5;
        Map<String, Integer> pos = new LinkedHashMap<>();
        pos.put("x", (int) Math.round(baseX + offsetX));
        pos.put("y", (int) Math.round(baseY + offsetY));
        return pos;
    }

    private static class AgentDefinition {
        final String id;
        final String name;
        final String department;
        final String color;
        final String description;

        AgentDefinition(String id, String name, String department, String color, String description) {
            this.id = id;
            this.name = name;
            this.department = department;
            this.color = color;
            this.description = description;
        }
    }

    private static class AgentActivityStats {
        String currentStatus = "idle";
        String lastActivity;
        int tasksToday;
        long successRate = 100;
        long avgDurationMs;
        int intelligenceScore = 50;
        int lazinessScore = 0;
        String currentTask;
        Map<String, Integer> position;
    }
}
