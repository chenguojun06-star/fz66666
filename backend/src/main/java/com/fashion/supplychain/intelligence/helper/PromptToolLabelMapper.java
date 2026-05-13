package com.fashion.supplychain.intelligence.helper;

public final class PromptToolLabelMapper {

    private PromptToolLabelMapper() {}

    public static String toolNameToLabel(String toolName) {
        if (toolName == null) return "";
        switch (toolName) {
            case "tool_system_overview": return "系统总览";
            case "tool_smart_report": return "智能报告";
            case "tool_deep_analysis": return "深度分析";
            case "tool_whatif": return "推演沙盘";
            case "tool_query_production_progress": return "生产进度";
            case "tool_action_executor": return "动作执行";
            case "tool_scan_undo": return "扫码撤回";
            case "tool_cutting_task_create": return "裁剪建单";
            case "tool_order_edit": return "订单编辑";
            case "tool_order_batch_close": return "批量关单";
            case "tool_bundle_split_transfer": return "拆菲转派";
            case "tool_order_learning": return "下单学习";
            case "tool_query_order_remarks": return "订单备注";
            case "tool_order_comparison": return "订单对比";
            case "tool_query_financial_payroll": return "计件工资";
            case "tool_payroll_approve": return "工资审批";
            case "tool_material_reconciliation": return "物料对账";
            case "tool_finance_workflow": return "财务工作流";
            case "tool_query_warehouse_stock": return "面辅料库存";
            case "tool_finished_product_stock": return "成品库存";
            case "tool_query_style_info": return "款式资料";
            case "tool_sample_stock": return "样衣库存";
            case "tool_material_audit": return "面辅料审核";
            case "tool_material_receive": return "面辅料收货";
            case "tool_material_doc_receive": return "单据收货";
            case "tool_warehouse_op_log": return "仓库日志";
            case "tool_sample_workflow": return "样衣流程";
            case "tool_sample_loan": return "样衣借调";
            case "tool_style_template": return "模板库";
            case "tool_knowledge_search": return "知识查询";
            case "tool_team_dispatch": return "协同派单";
            case "tool_create_production_order": return "AI建单";
            case "tool_procurement": return "采购管理";
            case "tool_org_query": return "组织架构";
            case "tool_management_dashboard": return "经营面板";
            case "tool_ai_accuracy_query": return "AI准确率";
            case "tool_root_cause_analysis": return "根因分析";
            case "tool_pattern_discovery": return "模式发现";
            case "tool_delay_trend": return "延期趋势";
            case "tool_sample_delay_analysis": return "样板延期";
            case "tool_personnel_delay_analysis": return "人员延期";
            case "tool_supplier_scorecard": return "供应商评分";
            case "tool_simulate_new_order": return "新单模拟";
            case "tool_defective_board": return "次品看板";
            case "tool_production_exception": return "生产异常";
            case "tool_secondary_process": return "二次工序";
            case "tool_order_factory_transfer": return "订单转厂";
            case "tool_order_factory_transfer_undo": return "撤回转厂";
            case "tool_order_contact_urge": return "催单通知";
            case "tool_quality_inbound": return "质检入库";
            case "tool_pattern_production": return "样板生产";
            case "tool_shipment_reconciliation": return "出货对账";
            case "tool_payroll_anomaly_detector": return "工资异常";
            case "tool_finished_outbound": return "成品出库";
            case "tool_material_calculation": return "物料计算";
            case "tool_material_picking": return "领料单";
            case "tool_query_style_difficulty": return "款式难度";
            case "tool_change_approval": return "变更审批";
            case "tool_query_crm_customer": return "CRM客户";
            case "tool_query_system_user": return "系统用户";
            case "tool_think": return "内部推理";
            case "tool_invoice": return "发票管理";
            case "tool_financial_report": return "财务报表";
            case "tool_ec_sales_revenue": return "电商营收";
            case "tool_tax_config": return "税务配置";
            case "tool_ecommerce_order": return "电商订单";
            case "tool_order_transfer": return "订单转单";
            case "tool_style_quotation": return "款式报价";
            case "tool_pattern_revision": return "样衣改版";
            case "tool_material_roll": return "物料卷";
            case "tool_material_quality_issue": return "物料质量";
            case "tool_inventory_check": return "盘点管理";
            case "tool_supplier": return "供应商";
            case "tool_dict": return "数据字典";
            case "tool_skill_execute": return "技能执行";
            case "tool_hyper_advisor": return "高级顾问";
            case "tool_unit_price_query": return "单价查询";
            case "tool_inventory_summary": return "库存汇总";
            case "tool_avg_completion_time": return "完成时间";
            case "tool_quality_statistics": return "质量统计";
            case "tool_order_timeline": return "订单时间线";
            case "bargain_price_tool": return "还价记录";
            case "tool_order_list": return "订单查询";
            case "tool_factory_list": return "工厂查询";
            case "tool_finance_list": return "财务查询";
            case "tool_warehouse_list": return "仓库查询";
            case "tool_crm_list": return "CRM客户";
            case "tool_bom_cost_calc": return "BOM成本";
            case "tool_quick_build_order": return "快速建单";
            case "tool_nl_query": return "智能查询";
            default: return "业务工具";
        }
    }
}