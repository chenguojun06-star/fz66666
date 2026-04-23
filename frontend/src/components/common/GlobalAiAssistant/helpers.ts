export const SUPER_ADMIN_ONLY_TOOLS = new Set([
  'tool_critic_evolution',
  'tool_ai_self_optimize_report',
]);

export const describeToolName = (toolName?: string, isSuperAdmin?: boolean) => {
  const raw = String(toolName || '').trim();
  if (!raw) return '处理步骤';
  if (SUPER_ADMIN_ONLY_TOOLS.has(raw) && !isSuperAdmin) return '系统优化';
  const mapped: Record<string, string> = {
    tool_system_overview: '系统总览',
    tool_smart_report: '智能报告',
    tool_deep_analysis: '深度分析',
    tool_whatif: '推演沙盘',
    tool_multi_agent: '多智能体分析',
    tool_query_production_progress: '工序跟进',
    tool_action_executor: '动作执行',
    tool_scan_undo: '扫码撤回',
    tool_cutting_task_create: '创建裁剪单',
    tool_order_edit: '订单编辑',
    tool_order_batch_close: '批量关单',
    tool_bundle_split_transfer: '拆菲转派',
    tool_order_learning: '下单学习',
    tool_query_order_remarks: '订单备注',
    tool_order_comparison: '订单对比分析',
    tool_query_financial_payroll: '计件工资查询',
    tool_payroll_approve: '工资审批',
    tool_material_reconciliation: '物料对账',
    tool_finance_workflow: '财务工作流',
    tool_query_warehouse_stock: '面辅料库存',
    tool_finished_product_stock: '成品库存',
    tool_query_style_info: '款式资料',
    tool_sample_stock: '样衣库存',
    tool_material_audit: '面辅料审核',
    tool_material_receive: '面辅料收货',
    tool_material_doc_receive: '采购单据收货',
    tool_warehouse_op_log: '仓库操作日志',
    tool_sample_workflow: '样衣流程',
    tool_sample_loan: '样衣借调',
    tool_style_template: '模板库',
    tool_knowledge_search: '知识库问答',
    tool_team_dispatch: '协同派单',
    tool_code_diagnostic: '系统诊断',
    tool_create_production_order: 'AI建单',
    tool_procurement: '采购管理',
    tool_org_query: '组织架构',
    tool_management_dashboard: '经营仪表盘',
    tool_root_cause_analysis: '根因分析',
    tool_pattern_discovery: '模式发现',
    tool_goal_decompose: '目标分解',
    tool_agent_meeting: '智能体会议',
    tool_critic_evolution: '批判进化',
    tool_delay_trend: '延期趋势',
    tool_sample_delay_analysis: '样板延期分析',
    tool_personnel_delay_analysis: '人员延期分析',
    tool_supplier_scorecard: '供应商评分',
    tool_scenario_simulator: '场景模拟',
    tool_simulate_new_order: '新单模拟',
    tool_defective_board: '次品看板',
    tool_production_exception: '生产异常',
    tool_secondary_process: '二次工序',
    tool_order_factory_transfer: '订单转厂',
    tool_order_factory_transfer_undo: '撤回转厂',
    tool_order_contact_urge: '催单通知',
    tool_quality_inbound: '质检入库',
    tool_pattern_production: '样板生产',
    tool_shipment_reconciliation: '出货对账',
    tool_payroll_anomaly_detect: '工资异常检测',
    tool_finished_outbound: '成品出库',
    tool_material_calculation: '物料计算',
    tool_material_picking: '领料单',
    tool_query_style_difficulty: '款式难度',
    tool_change_approval: '变更审批',
    tool_query_crm_customer: 'CRM客户',
    tool_query_system_user: '系统用户',
    tool_think: '内部推理',
  };
  return mapped[raw] || raw.replace(/^tool_/, '').replace(/_/g, ' ');
};

export const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

export const extractOrderNo = (text: string) => {
  const match = text.match(/\b([A-Z]{1,6}\d{6,}|\d{8,})\b/i);
  return match?.[1]?.trim();
};

export const isPurchaseDocFile = (file: File) => {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.pdf'].includes(ext);
};

export const shouldAutoInbound = (text: string) => /入库|到货入库|直接入库|自动入库/.test(text);
export const shouldAutoArrival = (text: string) => /自动收货|自动到货|一键收货|登记到货|收货/.test(text);
