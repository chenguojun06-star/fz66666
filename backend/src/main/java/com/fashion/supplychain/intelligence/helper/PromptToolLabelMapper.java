package com.fashion.supplychain.intelligence.helper;

public final class PromptToolLabelMapper {

    private PromptToolLabelMapper() {}

    public static String toolNameToLabel(String toolName) {
        if (toolName == null) return "";
        switch (toolName) {
            case "tool_order_list":         return "订单查询";
            case "tool_order_edit":         return "订单编辑";
            case "tool_scan_undo":          return "扫码撤回";
            case "tool_cutting_task_create": return "裁剪建单";
            case "tool_payroll_approve":    return "工资审批";
            case "tool_warehouse_list":     return "仓库查询";
            case "tool_factory_list":       return "工厂查询";
            case "tool_finance_list":       return "财务查询";
            case "tool_management_dashboard": return "经营面板";
            case "tool_ai_accuracy_query":     return "AI准确率";
            case "tool_knowledge_search":   return "知识查询";
            case "tool_bom_cost_calc":      return "BOM成本计算";
            case "tool_quick_build_order":  return "快速建单";
            case "tool_nl_query":           return "智能查询";
            case "tool_crm_list":           return "CRM客户";
            case "tool_procurement_list":   return "采购查询";
            default: {
                String label = toolName.startsWith("tool_") ? toolName.substring(5) : toolName;
                return label.replace('_', ' ');
            }
        }
    }
}
