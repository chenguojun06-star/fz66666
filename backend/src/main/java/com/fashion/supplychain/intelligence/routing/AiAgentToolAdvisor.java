package com.fashion.supplychain.intelligence.routing;

import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiAgentToolAdvisor {

    private static final Map<String, List<Pattern>> INTENT_TOOL_MAP = new LinkedHashMap<>();

    static {
        INTENT_TOOL_MAP.put("query_progress", compileAll(
                "进度", "跟进", "查询进度", "做到哪了", "完成多少", "扫码记录", "工序进度"));
        INTENT_TOOL_MAP.put("query_payroll", compileAll(
                "工资", "计件", "薪资", "结算金额", "我的工资", "多少钱"));
        INTENT_TOOL_MAP.put("query_stock", compileAll(
                "库存", "还有多少", "可用量", "库存量", "剩余"));
        INTENT_TOOL_MAP.put("query_style", compileAll(
                "款式", "BOM", "工价", "样衣", "开发进度"));
        INTENT_TOOL_MAP.put("action_hold", compileAll(
                "暂停", "挂起", "hold", "停一下"));
        INTENT_TOOL_MAP.put("action_expedite", compileAll(
                "加快", "加急", "催", "紧急", "expedite"));
        INTENT_TOOL_MAP.put("action_scan_undo", compileAll(
                "撤回扫码", "撤销扫码", "扫码撤回", "撤销扫描", "扫错了"));
        INTENT_TOOL_MAP.put("action_cutting", compileAll(
                "裁剪", "开裁", "裁床", "创建裁剪"));
        INTENT_TOOL_MAP.put("action_edit_order", compileAll(
                "编辑订单", "修改订单", "改订单", "改交期", "改备注"));
        INTENT_TOOL_MAP.put("action_approve", compileAll(
                "审批", "通过", "批准", "approve"));
        INTENT_TOOL_MAP.put("action_reconcile", compileAll(
                "对账", "核销", "出货对账", "物料对账"));
        INTENT_TOOL_MAP.put("action_receive", compileAll(
                "收货", "到货", "入库", "登记到货"));
        INTENT_TOOL_MAP.put("action_outbound", compileAll(
                "出库", "发货", "成品出库"));
        INTENT_TOOL_MAP.put("action_picking", compileAll(
                "领料", "备料", "领料单"));
        INTENT_TOOL_MAP.put("analysis_report", compileAll(
                "日报", "周报", "月报", "报告", "汇总"));
        INTENT_TOOL_MAP.put("analysis_deep", compileAll(
                "深度分析", "根因", "为什么", "原因分析", "瓶颈"));
        INTENT_TOOL_MAP.put("analysis_whatif", compileAll(
                "推演", "沙盘", "如果", "假设", "模拟"));
        INTENT_TOOL_MAP.put("analysis_overview", compileAll(
                "总览", "概览", "今天怎么样", "系统状态", "经营状况"));
        INTENT_TOOL_MAP.put("action_create_order", compileAll(
                "下单", "建单", "创建订单", "新建订单", "新增订单", "帮我下单", "我要下单", "下给"));
        INTENT_TOOL_MAP.put("action_sample_loan", compileAll(
                "借调", "借样衣", "样衣借出", "借出样衣", "归还样衣", "样衣归还"));
        INTENT_TOOL_MAP.put("action_sample_workflow", compileAll(
                "样衣开发", "样衣流程", "打样", "推送到下单", "样板领取", "样板入库"));
        INTENT_TOOL_MAP.put("knowledge_search", compileAll(
                "什么是", "怎么操作", "如何", "帮助", "教程", "规则"));
    }

    private static final Map<String, List<String>> INTENT_TO_TOOLS = Map.ofEntries(
            Map.entry("query_progress", List.of("tool_query_production_progress", "tool_think")),
            Map.entry("query_payroll", List.of("tool_query_financial_payroll", "tool_think")),
            Map.entry("query_stock", List.of("tool_query_warehouse_stock", "tool_finished_product_stock", "tool_think")),
            Map.entry("query_style", List.of("tool_query_style_info", "tool_sample_stock", "tool_think")),
            Map.entry("action_hold", List.of("tool_action_executor", "tool_order_edit", "tool_think")),
            Map.entry("action_expedite", List.of("tool_action_executor", "tool_order_contact_urge", "tool_think")),
            Map.entry("action_scan_undo", List.of("tool_scan_undo", "tool_think")),
            Map.entry("action_cutting", List.of("tool_cutting_task_create", "tool_think")),
            Map.entry("action_edit_order", List.of("tool_order_edit", "tool_query_order_remarks", "tool_think")),
            Map.entry("action_approve", List.of("tool_change_approval", "tool_payroll_approve", "tool_finance_workflow", "tool_think")),
            Map.entry("action_reconcile", List.of("tool_material_reconciliation", "tool_shipment_reconciliation", "tool_think")),
            Map.entry("action_receive", List.of("tool_material_receive", "tool_material_doc_receive", "tool_quality_inbound", "tool_think")),
            Map.entry("action_outbound", List.of("tool_finished_outbound", "tool_think")),
            Map.entry("action_picking", List.of("tool_material_picking", "tool_material_calculation", "tool_think")),
            Map.entry("analysis_report", List.of("tool_smart_report", "tool_management_dashboard", "tool_think")),
            Map.entry("analysis_deep", List.of("tool_deep_analysis", "tool_root_cause_analysis", "tool_pattern_discovery", "tool_think")),
            Map.entry("analysis_whatif", List.of("tool_whatif", "tool_scenario_simulator", "tool_simulate_new_order", "tool_think")),
            Map.entry("analysis_overview", List.of("tool_system_overview", "tool_management_dashboard", "tool_think")),
            Map.entry("knowledge_search", List.of("tool_knowledge_search", "tool_think")),
            Map.entry("action_create_order", List.of("tool_create_production_order", "tool_query_style_info", "tool_think")),
            Map.entry("action_sample_loan", List.of("tool_sample_loan", "tool_sample_stock", "tool_think")),
            Map.entry("action_sample_workflow", List.of("tool_sample_workflow", "tool_sample_stock", "tool_sample_loan", "tool_think"))
    );

    private static final Set<String> ALWAYS_INCLUDE = Set.of(
            "tool_knowledge_search", "tool_think", "tool_team_dispatch"
    );

    public List<AgentTool> advise(List<AgentTool> domainFilteredTools, String userMessage) {
        if (userMessage == null || userMessage.isBlank() || domainFilteredTools.size() <= 8) {
            return domainFilteredTools;
        }

        String text = userMessage.toLowerCase(Locale.ROOT);
        Set<String> advisedToolNames = new LinkedHashSet<>();

        for (Map.Entry<String, List<Pattern>> entry : INTENT_TOOL_MAP.entrySet()) {
            for (Pattern p : entry.getValue()) {
                if (p.matcher(text).find()) {
                    List<String> tools = INTENT_TO_TOOLS.get(entry.getKey());
                    if (tools != null) {
                        advisedToolNames.addAll(tools);
                    }
                    break;
                }
            }
        }

        advisedToolNames.addAll(ALWAYS_INCLUDE);

        if (advisedToolNames.size() < 3) {
            log.debug("[ToolAdvisor] 意图不够明确，保留全部领域工具");
            return domainFilteredTools;
        }

        Set<String> finalNames = advisedToolNames;
        List<AgentTool> advised = domainFilteredTools.stream()
                .filter(t -> finalNames.contains(t.getName()))
                .collect(Collectors.toList());

        if (advised.size() < 3) {
            log.debug("[ToolAdvisor] 预选工具过少({})，回退到领域工具集", advised.size());
            return domainFilteredTools;
        }

        log.info("[ToolAdvisor] 工具预选: {} → {} 个工具 (原 {} 个)", advisedToolNames, advised.size(), domainFilteredTools.size());
        return advised;
    }

    private static List<Pattern> compileAll(String... keywords) {
        List<Pattern> patterns = new ArrayList<>(keywords.length);
        for (String kw : keywords) {
            patterns.add(Pattern.compile(Pattern.quote(kw), Pattern.CASE_INSENSITIVE));
        }
        return patterns;
    }
}
