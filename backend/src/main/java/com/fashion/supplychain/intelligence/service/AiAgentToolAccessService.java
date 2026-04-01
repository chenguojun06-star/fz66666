package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AiAgentToolAccessService {

    private static final LinkedHashMap<String, ToolRule> TOOL_RULES = new LinkedHashMap<>();
    private static final Map<String, Integer> TOOL_ORDER = new LinkedHashMap<>();

    static {
        register("tool_system_overview", "系统全局总览：订单、风险、今日动态与重点事项，适合“系统状态、今天怎么样、最该关注什么”", false);
        register("tool_query_production_progress", "生产进度查询：按订单、款号、状态看进度与扫码记录，适合“这单到哪了、我负责的订单怎么样”", true);
        register("tool_smart_report", "智能报告生成：日报、周报、月报，适合经营汇总与正式报告输出", false);
        register("tool_deep_analysis", "深度分析：工厂排名、瓶颈、交期风险、成本结构，适合经营诊断", false);
        register("tool_action_executor", "动作执行：紧急标记、备注、通知等轻量写操作，适合对象明确的直接处理", false);
        register("tool_query_style_info", "款式资料查询：BOM、工价、开发进度、样衣阶段等款式信息", false);
        register("tool_query_warehouse_stock", "面辅料库存查询：按材料、颜色、供应商查看库存与可用量", false);
        register("tool_query_financial_payroll", "本人计件工资查询：自己的扫码计件记录与已结算金额（工人仅限本人数据，管理员可查全员）", true);
        register("tool_sample_stock", "样衣库存查询：开发样、产前样、销售样等样衣库存与借出情况", false);
        register("tool_finished_product_stock", "成品库存查询：按款号、颜色、尺码、SKU 查看大货库存", false);
        register("tool_query_crm_customer", "客户档案查询：客户级别、联系人、信用与折扣信息", false);
        register("tool_query_system_user", "员工与账号查询：角色、工序、权限与人员资料", false);
        register("tool_change_approval", "变更审批：查看待审批、审批通过或驳回", false);
        register("tool_whatif", "推演沙盘：提前交货、换厂、加人、延期开工等方案测算", false);
        register("tool_multi_agent", "多智能体综合分析：适合“全面分析、综合评估、宏观判断”", false);
        register("tool_knowledge_search", "知识库问答：行业术语、系统操作、业务规则与 FAQ", true);
        register("tool_scan_undo", "扫码撤回：撤销错误扫码，受时效和业务规则限制", false);
        register("tool_cutting_task_create", "裁剪单创建：按款号和颜色尺码数量直接开裁剪单", false);
        register("tool_order_edit", "订单编辑：修改备注、紧急程度、工厂、客户、交期等", false);
        register("tool_payroll_approve", "工资结算审批：通过或取消工资结算", false);
        register("tool_team_dispatch", "协同派单：把任务分配给跟单、采购、财务、仓库、主管等岗位", false);
        register("tool_material_audit", "面辅料审核：查看待审、发起审核、通过或驳回", false);
        register("tool_material_reconciliation", "物料对账：查询对账状态、解释异常、推进处理", false);
        register("tool_finance_workflow", "财务工作流：查看待付款待审批、执行付款与审批动作", false);
        register("tool_sample_workflow", "样衣与样板流程：启动阶段、更新进度、审核、推到下单管理", false);
        register("tool_sample_loan", "样衣借调归还：处理样衣借出、归还与库存回补", false);
        register("tool_warehouse_op_log", "仓库操作日志：追溯样衣借调、归还、大货出库等审计轨迹", false);
        register("tool_material_receive", "面辅料收货：智能收货预览、登记到货、直接入库、一键收货", false);
        register("tool_style_template", "模板库与多码单价：生成模板、套模板、同步工序单价", false);
        register("tool_material_doc_receive", "采购单据自动收货：按识别单据回放结果直接执行收货或入库", false);
        register("tool_bundle_split_transfer", "拆菲转派：拆分菲号、转派执行人、查询拆分族谱、撤回拆分", false);
        register("tool_order_learning", "下单学习：分析历史同款、推荐工厂与单价策略、解释成本偏高原因", false);
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

    public List<AgentTool> resolveVisibleTools(List<AgentTool> registeredTools) {
        if (registeredTools == null || registeredTools.isEmpty()) {
            return List.of();
        }

        boolean managerAccess = hasManagerAccess();
        return registeredTools.stream()
                .filter(tool -> managerAccess || isWorkerVisible(tool.getName()))
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
        return hasManagerAccess() || isWorkerVisible(toolName);
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
            builder.append("当前账号开放本人直接相关的查询：生产进度、本人计件工资明细、系统知识库；管理、审批、财务总览、跨部门协同类工具已自动隐藏。\n");
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

    private static void register(String toolName, String guide, boolean workerVisible) {
        TOOL_RULES.put(toolName, new ToolRule(guide, workerVisible));
        TOOL_ORDER.put(toolName, TOOL_ORDER.size());
    }

    private static final class ToolRule {
        private final String guide;
        private final boolean workerVisible;

        private ToolRule(String guide, boolean workerVisible) {
            this.guide = guide;
            this.workerVisible = workerVisible;
        }
    }
}
