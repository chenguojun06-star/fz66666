package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class AiAgentToolAccessService {

    private static final LinkedHashMap<String, ToolRule> TOOL_RULES = new LinkedHashMap<>();
    private static final Map<String, Integer> TOOL_ORDER = new LinkedHashMap<>();

    static {
        // ── ANALYSIS 领域 ──
        register("tool_system_overview", "系统全局总览：订单、风险、今日动态与重点事项，适合\u201c系统状态、今天怎么样、最该关注什么\u201d", false, ToolDomain.ANALYSIS);
        register("tool_smart_report", "智能报告生成：日报、周报、月报，适合经营汇总与正式报告输出", false, ToolDomain.ANALYSIS);
        register("tool_deep_analysis", "深度分析：工厂排名、瓶颈、交期风险、成本结构，适合经营诊断", false, ToolDomain.ANALYSIS);
        register("tool_whatif", "推演沙盘：提前交货、换厂、加人、延期开工等方案测算", false, ToolDomain.ANALYSIS);
        // ── PRODUCTION 领域 ──
        register("tool_query_production_progress", "生产进度查询：按订单/款号查6大工序进度、工人数量、出货预测(80-90%)，支持菲号进度和工人统计", true, ToolDomain.PRODUCTION);
        register("tool_action_executor", "动作执行：紧急标记、备注、通知等轻量写操作，适合对象明确的直接处理", false, ToolDomain.PRODUCTION);
        register("tool_scan_undo", "扫码撤回：撤销错误扫码，受时效和业务规则限制", false, ToolDomain.PRODUCTION);
        register("tool_cutting_task_create", "裁剪单创建：按款号和颜色尺码数量直接开裁剪单", false, ToolDomain.PRODUCTION);
        register("tool_order_edit", "订单编辑：修改备注、紧急程度、工厂、客户、交期等", false, ToolDomain.PRODUCTION);
        register("tool_order_batch_close", "批量关单：关闭一个或多个生产订单，支持正常关单和特需关单", false, ToolDomain.PRODUCTION);
        register("tool_bundle_split_transfer", "拆菲转派：拆分菲号、转派执行人、查询拆分族谱、撤回拆分", false, ToolDomain.PRODUCTION);
        register("tool_order_learning", "下单学习：分析历史同款、推荐工厂与单价策略、解释成本偏高原因", false, ToolDomain.PRODUCTION);
        register("tool_query_order_remarks", "订单备注历史：查询指定订单的所有人工与系统自动备注（采购入库/裁剪领取/质检入库），适合'这单有什么问题''备注里写了什么'", false, ToolDomain.PRODUCTION);
        register("tool_order_comparison", "订单对比分析：对比异常订单与同款正常订单差异，定位异常根因，适合'为什么这单异常''跟正常单比'", false, ToolDomain.PRODUCTION);
        // ── FINANCE 领域 ──
        register("tool_query_financial_payroll", "本人计件工资查询：自己的扫码计件记录与已结算金额（工人仅限本人数据，管理员可查全员）", true, ToolDomain.FINANCE);
        register("tool_payroll_approve", "工资结算审批：通过或取消工资结算", false, ToolDomain.FINANCE);
        register("tool_material_reconciliation", "物料对账：查询对账状态、解释异常、推进处理", false, ToolDomain.FINANCE);
        register("tool_finance_workflow", "财务工作流：查看待付款待审批、执行付款与审批动作", false, ToolDomain.FINANCE);
        // ── WAREHOUSE 领域 ──
        register("tool_query_warehouse_stock", "面辅料库存查询：按材料、颜色、供应商查看库存与可用量", false, ToolDomain.WAREHOUSE);
        register("tool_finished_product_stock", "成品库存查询：按款号、颜色、尺码、SKU 查看大货库存", false, ToolDomain.WAREHOUSE);
        // ── STYLE 领域 ──
        register("tool_query_style_info", "款式资料查询：BOM、工价、开发进度、样衣阶段等款式信息", false, ToolDomain.STYLE);
        register("tool_sample_stock", "样衣库存查询：开发样、产前样、销售样等样衣库存与借出情况", false, ToolDomain.STYLE);
        // ── WAREHOUSE 补充 ──
        register("tool_material_audit", "面辅料审核：查看待审、发起审核、通过或驳回", false, ToolDomain.WAREHOUSE);
        register("tool_material_receive", "面辅料收货：智能收货预览、登记到货、直接入库、一键收货", false, ToolDomain.WAREHOUSE);
        register("tool_material_doc_receive", "采购单据自动收货：按识别单据回放结果直接执行收货或入库", false, ToolDomain.WAREHOUSE);
        register("tool_warehouse_op_log", "仓库操作日志：追溯样衣借调、归还、大货出库等审计轨迹", false, ToolDomain.WAREHOUSE);
        // ── STYLE 补充 ──
        register("tool_sample_workflow", "样衣与样板流程：启动阶段、更新进度、审核、推到下单管理", false, ToolDomain.STYLE);
        register("tool_sample_loan", "样衣借调归还：处理样衣借出、归还与库存回补", false, ToolDomain.STYLE);
        register("tool_style_template", "模板库与多码单价：生成模板、套模板、同步工序单价", false, ToolDomain.STYLE);
        // ── SYSTEM / GENERAL 领域 ──
        register("tool_knowledge_search", "知识库问答：行业术语、系统操作、业务规则与 FAQ", true, ToolDomain.GENERAL);
        register("tool_team_dispatch", "协同派单：把任务分配给跟单、采购、财务、仓库、主管等岗位", false, ToolDomain.SYSTEM);
        register("tool_create_production_order", "AI完整建单：按正式链路创建生产订单（仅管理员）", false, ToolDomain.PRODUCTION);
        register("tool_procurement", "采购管理：查询/创建采购单、确认到货入库（写操作仅管理员）", false, ToolDomain.WAREHOUSE);
        register("tool_org_query", "组织架构查询：部门树、部门列表、成员分布", false, ToolDomain.SYSTEM);
        // ── ANALYSIS 补充 ──
        register("tool_management_dashboard", "管理层经营仪表盘：实时KPI快照、风险等级、利润排名", false, ToolDomain.ANALYSIS);
        register("tool_ai_accuracy_query", "AI准确率查询：交期命中率、建议采纳率、平均偏差天数、自优化洞察", false, ToolDomain.ANALYSIS);
        register("tool_root_cause_analysis", "根因分析：深入分析问题根因，适合\u201c为什么\u201d\u201c根因是什么\u201d", false, ToolDomain.ANALYSIS);
        register("tool_pattern_discovery", "模式发现：识别数据规律与异常模式", false, ToolDomain.ANALYSIS);
        register("tool_delay_trend", "延期趋势分析：延期率走势、延期集中领域", false, ToolDomain.ANALYSIS);
        register("tool_sample_delay_analysis", "样板延期分析：样板开发延期原因与影响", false, ToolDomain.ANALYSIS);
        register("tool_personnel_delay_analysis", "人员延期分析：跟单员/岗位延期分布", false, ToolDomain.ANALYSIS);
        register("tool_supplier_scorecard", "供应商评分卡：工厂综合评分与对比", false, ToolDomain.ANALYSIS);
        register("tool_simulate_new_order", "新单模拟：模拟新订单对产能和交期的影响", false, ToolDomain.ANALYSIS);
        // ── PRODUCTION 补充 ──
        register("tool_defective_board", "次品看板：次品分布、返修/报废操作", false, ToolDomain.PRODUCTION);
        register("tool_production_exception", "生产异常：上报/查看生产异常事件", false, ToolDomain.PRODUCTION);
        register("tool_secondary_process", "二次工序：创建/更新二次加工工序", false, ToolDomain.PRODUCTION);
        register("tool_order_factory_transfer", "订单转厂：将订单从一家工厂转到另一家", false, ToolDomain.PRODUCTION);
        register("tool_order_factory_transfer_undo", "撤回转厂：撤销订单转厂操作", false, ToolDomain.PRODUCTION);
        register("tool_order_contact_urge", "催单通知：向跟单员/工厂发送催单提醒", false, ToolDomain.PRODUCTION);
        register("tool_quality_inbound", "成品质检入库：质检通过后登记入库", false, ToolDomain.PRODUCTION);
        register("tool_pattern_production", "样板生产：查看样板生产进度与状态", false, ToolDomain.PRODUCTION);
        // ── FINANCE 补充 ──
        register("tool_shipment_reconciliation", "出货对账查询：出货单与结算对账状态", false, ToolDomain.FINANCE);
        register("tool_payroll_anomaly_detector", "工资异常检测：识别计件工资异常波动", false, ToolDomain.FINANCE);
        // ── WAREHOUSE 补充 ──
        register("tool_finished_outbound", "成品出库：登记成品出库记录", false, ToolDomain.WAREHOUSE);
        register("tool_material_calculation", "物料计算：根据BOM计算物料需求量", false, ToolDomain.WAREHOUSE);
        register("tool_material_picking", "领料单：创建面辅料领料记录", false, ToolDomain.WAREHOUSE);
        // ── STYLE 补充 ──
        register("tool_query_style_difficulty", "款式难度查询：评估款式生产难度系数", false, ToolDomain.STYLE);
        // ── SYSTEM 补充 ──
        register("tool_change_approval", "变更审批：查看/通过/驳回变更申请", false, ToolDomain.SYSTEM);
        register("tool_query_crm_customer", "CRM客户查询：客户信息与交易记录", false, ToolDomain.SYSTEM);
        register("tool_query_system_user", "系统用户查询：用户账号与角色信息", false, ToolDomain.SYSTEM);
        // ── GENERAL 补充 ──
        register("tool_think", "内部推理：复杂问题分步思考，无副作用", true, ToolDomain.GENERAL);
        // ── FINANCE 新增 ──
        register("tool_invoice", "发票管理：查询/创建/开票/作废发票，发票统计", false, ToolDomain.FINANCE);
        register("tool_financial_report", "财务报表：利润表/资产负债表/现金流量表", false, ToolDomain.FINANCE);
        register("tool_ec_sales_revenue", "电商营收：查看电商渠道营收记录与统计", false, ToolDomain.FINANCE);
        register("tool_tax_config", "税务配置：查看税率列表、当前生效税率、计算税费", false, ToolDomain.FINANCE);
        // ── PRODUCTION 新增 ──
        register("tool_ecommerce_order", "电商订单：查看电商渠道订单列表与统计", false, ToolDomain.PRODUCTION);
        register("tool_order_transfer", "订单转单：查看/创建/接受/拒绝转单", false, ToolDomain.PRODUCTION);
        // ── STYLE 新增 ──
        register("tool_style_quotation", "款式报价：查询/创建/审核/解锁报价", false, ToolDomain.STYLE);
        register("tool_pattern_revision", "样衣改版：查看/创建/审批改版记录", false, ToolDomain.STYLE);
        // ── WAREHOUSE 新增 ──
        register("tool_material_roll", "物料卷：查看物料卷列表/详情/扫码", false, ToolDomain.WAREHOUSE);
        register("tool_material_quality_issue", "物料质量问题：查看/统计/解决质量问题", false, ToolDomain.WAREHOUSE);
        register("tool_inventory_check", "盘点管理：查看/创建/确认/取消盘点", false, ToolDomain.WAREHOUSE);
        register("tool_supplier", "供应商查询：查看供应商列表与详情", false, ToolDomain.WAREHOUSE);
        // ── SYSTEM 新增 ──
        register("tool_dict", "数据字典：查看字典列表、按类型查询字典项", false, ToolDomain.SYSTEM);
        // ── GENERAL 新增 ── 技能链
        register("tool_skill_execute", "执行预定义技能工作流：一句话触发多步操作，如月底财务结算、质检批量处理、风险订单巡检", false, ToolDomain.GENERAL);
    }

    private static final Set<String> HIGH_RISK_TOOLS = Set.of(
            "tool_scan_undo", "tool_cutting_task_create", "tool_order_edit",
            "tool_order_batch_close",
            "tool_payroll_approve", "tool_action_executor", "tool_bundle_split_transfer",
            "tool_create_production_order",
            "tool_change_approval", "tool_order_factory_transfer", "tool_order_factory_transfer_undo",
            "tool_finance_workflow", "tool_quality_inbound", "tool_finished_outbound",
            "tool_sample_workflow", "tool_style_template", "tool_team_dispatch",
            "tool_material_doc_receive", "tool_material_receive", "tool_material_audit",
            "tool_material_reconciliation", "tool_defective_board",
            "tool_invoice", "tool_financial_report", "tool_style_quotation",
            "tool_order_transfer", "tool_pattern_revision", "tool_inventory_check",
            "tool_sample_loan", "tool_order_contact_urge", "tool_production_exception",
            "tool_secondary_process", "tool_material_picking", "tool_material_quality_issue"
    );

    private static final Set<String> WRITE_OPERATION_TOOLS = Set.of(
            "tool_procurement",
            "tool_order_factory_transfer_undo",
            "tool_sample_loan",
            "tool_order_contact_urge",
            "tool_defective_board",
            "tool_material_quality_issue"
    );

    public enum ConfirmLevel { READ_ONLY, WRITE, HIGH_RISK }

    public static boolean isHighRisk(String toolName) {
        return toolName != null && HIGH_RISK_TOOLS.contains(toolName);
    }

    public static boolean isWriteOperation(String toolName) {
        if (toolName == null) return false;
        return HIGH_RISK_TOOLS.contains(toolName) || WRITE_OPERATION_TOOLS.contains(toolName);
    }

    public static ConfirmLevel getConfirmLevel(String toolName) {
        if (toolName == null) return ConfirmLevel.READ_ONLY;
        if (HIGH_RISK_TOOLS.contains(toolName)) return ConfirmLevel.HIGH_RISK;
        if (WRITE_OPERATION_TOOLS.contains(toolName)) return ConfirmLevel.WRITE;
        return ConfirmLevel.READ_ONLY;
    }

    private static final Map<String, String> TOOL_CONFIRM_LABELS = Map.ofEntries(
            Map.entry("tool_sample_loan", "样衣借调"),
            Map.entry("tool_scan_undo", "扫码撤回"),
            Map.entry("tool_cutting_task_create", "裁剪单创建"),
            Map.entry("tool_order_edit", "订单编辑"),
            Map.entry("tool_order_batch_close", "批量关单"),
            Map.entry("tool_payroll_approve", "工资审批"),
            Map.entry("tool_action_executor", "操作执行"),
            Map.entry("tool_bundle_split_transfer", "拆菲转派"),
            Map.entry("tool_create_production_order", "创建订单"),
            Map.entry("tool_change_approval", "变更审批"),
            Map.entry("tool_order_factory_transfer", "订单转厂"),
            Map.entry("tool_order_factory_transfer_undo", "撤回转厂"),
            Map.entry("tool_finance_workflow", "财务操作"),
            Map.entry("tool_quality_inbound", "质检入库"),
            Map.entry("tool_finished_outbound", "成品出库"),
            Map.entry("tool_sample_workflow", "样衣流程"),
            Map.entry("tool_style_template", "模板操作"),
            Map.entry("tool_team_dispatch", "协同派单"),
            Map.entry("tool_material_doc_receive", "单据收货"),
            Map.entry("tool_material_receive", "面辅料收货"),
            Map.entry("tool_material_audit", "面辅料审核"),
            Map.entry("tool_material_reconciliation", "物料对账"),
            Map.entry("tool_invoice", "发票操作"),
            Map.entry("tool_financial_report", "财务报表"),
            Map.entry("tool_style_quotation", "款式报价"),
            Map.entry("tool_order_transfer", "订单转单"),
            Map.entry("tool_pattern_revision", "样衣改版"),
            Map.entry("tool_inventory_check", "盘点操作"),
            Map.entry("tool_order_contact_urge", "催单通知"),
            Map.entry("tool_production_exception", "生产异常"),
            Map.entry("tool_secondary_process", "二次工序"),
            Map.entry("tool_material_picking", "领料操作"),
            Map.entry("tool_material_quality_issue", "质量问题"),
            Map.entry("tool_procurement", "采购操作"),
            Map.entry("tool_defective_board", "次品操作")
    );

    public static String getConfirmLabel(String toolName) {
        if (toolName == null) return "操作";
        return TOOL_CONFIRM_LABELS.getOrDefault(toolName, "操作");
    }

    private static final long APPROVAL_TOKEN_TTL_MS = 30 * 60 * 1000L;
    private final Map<String, ApprovalEntry> approvalTokens = new ConcurrentHashMap<>();

    public boolean isHighRiskTool(String toolName) {
        return isHighRisk(toolName);
    }

    public String generateApprovalToken(String toolName, Map<String, Object> args) {
        String token = UUID.randomUUID().toString().replace("-", "");
        approvalTokens.put(token, new ApprovalEntry(toolName, System.currentTimeMillis()));
        return token;
    }

    public boolean validateApprovalToken(String toolName, String token) {
        ApprovalEntry entry = approvalTokens.remove(token);
        if (entry == null) return false;
        if (!entry.toolName.equals(toolName)) return false;
        if (System.currentTimeMillis() - entry.createdAt > APPROVAL_TOKEN_TTL_MS) return false;
        return true;
    }

    @lombok.AllArgsConstructor
    @lombok.Data
    private static class ApprovalEntry {
        private final String toolName;
        private final long createdAt;
    }

    public static ToolDomain getDomainForTool(String toolName) {
        ToolRule rule = TOOL_RULES.get(toolName);
        return rule != null ? rule.domain : ToolDomain.GENERAL;
    }

    public List<AgentTool> filterByDomains(List<AgentTool> tools, Set<ToolDomain> domains) {
        if (domains == null || domains.isEmpty()) {
            return tools;
        }
        return tools.stream()
                .filter(t -> {
                    ToolDomain d = getDomainForTool(t.getName());
                    return domains.contains(d) || d == ToolDomain.SYSTEM || d == ToolDomain.GENERAL;
                })
                .collect(Collectors.toList());
    }

    public boolean hasManagerAccess() {
        if (UserContext.isSuperAdmin() || UserContext.isTenantOwner() || UserContext.isSupervisorOrAbove()) {
            return true;
        }

        String role = UserContext.role();
        if (!StringUtils.hasText(role)) {
            return false;
        }

        String normalized = role.trim().toLowerCase(Locale.ROOT);
        return normalized.contains("merchandiser")
                || normalized.contains("director")
                || normalized.contains("owner")
                || normalized.contains("boss")
                || normalized.contains("chief")
                || normalized.contains("head")
                || role.contains("跟单")
                || role.contains("主管")
                || role.contains("管理")
                || role.contains("组长")
                || role.contains("班长")
                || role.contains("厂长")
                || role.contains("老板");
    }

    private static final Set<ToolDomain> FACTORY_BLOCKED_DOMAINS = Set.of(
            ToolDomain.FINANCE, ToolDomain.STYLE
    );

    private static final Set<String> FACTORY_BLOCKED_TOOLS = Set.of(
            "tool_shipment_reconciliation",
            "tool_material_reconciliation",
            "tool_sample_workflow",
            "tool_sample_loan",
            "tool_sample_stock",
            "tool_style_template",
            "tool_query_style_info",
            "tool_query_style_difficulty",
            "tool_style_quotation",
            "tool_pattern_revision",
            "tool_order_learning",
            "tool_procurement",
            "tool_invoice",
            "tool_financial_report",
            "tool_ec_sales_revenue",
            "tool_tax_config",
            "tool_ecommerce_order",
            "tool_payroll_anomaly_detector"
    );

    private static final List<String> SUPER_ADMIN_ONLY_TOOLS = List.of();

    public List<AgentTool> resolveVisibleTools(List<AgentTool> registeredTools) {
        if (registeredTools == null || registeredTools.isEmpty()) {
            return List.of();
        }

        boolean managerAccess = hasManagerAccess();
        boolean superAdmin = UserContext.isSuperAdmin();
        boolean factoryUser = UserContext.factoryId() != null;
        return registeredTools.stream()
                .filter(tool -> {
                    if (SUPER_ADMIN_ONLY_TOOLS.contains(tool.getName())) {
                        return superAdmin;
                    }
                    if (factoryUser && isFactoryBlocked(tool.getName())) {
                        return false;
                    }
                    return managerAccess || isWorkerVisible(tool.getName());
                })
                .sorted(Comparator
                        .comparingInt((AgentTool tool) -> TOOL_ORDER.getOrDefault(tool.getName(), Integer.MAX_VALUE))
                        .thenComparing(AgentTool::getName))
                .collect(Collectors.toList());
    }

    public List<AiTool> toApiTools(List<AgentTool> visibleTools) {
        if (visibleTools == null || visibleTools.isEmpty()) {
            return List.of();
        }
        return visibleTools.stream()
                .map(AgentTool::getToolDefinition)
                .collect(Collectors.toList());
    }

    public boolean canUseTool(String toolName) {
        if (SUPER_ADMIN_ONLY_TOOLS.contains(toolName)) {
            return UserContext.isSuperAdmin();
        }
        if (UserContext.factoryId() != null && isFactoryBlocked(toolName)) {
            return false;
        }
        return hasManagerAccess() || isWorkerVisible(toolName);
    }

    private boolean isFactoryBlocked(String toolName) {
        if (FACTORY_BLOCKED_TOOLS.contains(toolName)) {
            return true;
        }
        ToolRule rule = TOOL_RULES.get(toolName);
        return rule != null && FACTORY_BLOCKED_DOMAINS.contains(rule.domain);
    }

    public String buildToolGuide(List<AgentTool> visibleTools) {
        StringBuilder builder = new StringBuilder();
        builder.append("【当前会话可用工具】\n");

        if (visibleTools == null || visibleTools.isEmpty()) {
            builder.append("当前账号未开放任何业务工具，本轮只能基于已有上下文回答。\n\n");
            return builder.toString();
        }

        int index = 1;
        for (AgentTool tool : visibleTools) {
            builder.append(index++)
                    .append(". ")
                    .append(tool.getName())
                    .append(" — ")
                    .append(resolveGuide(tool))
                    .append("\n");
        }

        if (!hasManagerAccess()) {
            builder.append("当前账号开放本人直接相关的查询：工序跟进、本人计件工资明细、系统知识库；管理、审批、财务总览、跨部门协同类工具已自动隐藏。\n");
        }
        builder.append("\n");
        return builder.toString();
    }

    private boolean isWorkerVisible(String toolName) {
        ToolRule rule = TOOL_RULES.get(toolName);
        return rule != null && rule.workerVisible;
    }

    private String resolveGuide(AgentTool tool) {
        ToolRule rule = TOOL_RULES.get(tool.getName());
        if (rule != null) {
            return rule.guide;
        }
        return truncate(resolveFallbackDescription(tool), 100);
    }

    private String resolveFallbackDescription(AgentTool tool) {
        AiTool toolDefinition = tool.getToolDefinition();
        if (toolDefinition == null || toolDefinition.getFunction() == null) {
            return "通用业务工具";
        }
        String description = toolDefinition.getFunction().getDescription();
        if (!StringUtils.hasText(description)) {
            return "通用业务工具";
        }
        return description.replace("\n", " ").replace("\r", " ").trim();
    }

    private String truncate(String text, int maxLength) {
        if (!StringUtils.hasText(text) || text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength - 1)) + "…";
    }

    private static void register(String toolName, String guide, boolean workerVisible, ToolDomain domain) {
        TOOL_RULES.put(toolName, new ToolRule(guide, workerVisible, domain));
        TOOL_ORDER.put(toolName, TOOL_ORDER.size());
    }

    static final class ToolRule {
        final String guide;
        final boolean workerVisible;
        final ToolDomain domain;

        ToolRule(String guide, boolean workerVisible, ToolDomain domain) {
            this.guide = guide;
            this.workerVisible = workerVisible;
            this.domain = domain;
        }
    }
}
