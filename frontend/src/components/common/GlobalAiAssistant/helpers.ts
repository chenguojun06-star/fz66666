import type { CSSProperties } from 'react';
import type { Message } from './types';
import { getPageSuggestions } from './constants';
import { getPageLabel } from '@/routeConfig';

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
    tool_invoice: '发票管理',
    tool_financial_report: '财务报表',
    tool_ec_sales_revenue: '电商营收',
    tool_tax_config: '税务配置',
    tool_ecommerce_order: '电商订单',
    tool_order_transfer: '订单转单',
    tool_style_quotation: '款式报价',
    tool_pattern_revision: '样衣改版',
    tool_material_roll: '物料卷',
    tool_material_quality_issue: '物料质量',
    tool_inventory_check: '盘点管理',
    tool_supplier: '供应商',
    tool_dict: '数据字典',
  };
  // 兜底用通用中文名，不展示原始 tool_xxx 英文代码
  return mapped[raw] || '系统能力';
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

export function buildReportInsight(label: string, data: any): string {
  if (!data) {
    return `📊 ${label}已生成（数据加载中），下方看板将展示核心指标。`;
  }
  const lines: string[] = [];
  lines.push(`📊 **${label}解读**（${data.rangeLabel || ''} · ${data.scope || '全公司'}）`);

  const kpis: any[] = Array.isArray(data.kpis) ? data.kpis : [];
  if (kpis.length > 0) {
    const ups = kpis.filter(k => k.change && k.change.startsWith('+') && k.change !== '+0.0%');
    const downs = kpis.filter(k => k.change && k.change.startsWith('-'));
    const highlights: string[] = [];
    if (ups.length > 0) {
      const top = ups.sort((a, b) => parseFloat(b.change) - parseFloat(a.change))[0];
      highlights.push(`「${top.name}」${top.current.toLocaleString()}${top.unit}（环比 ${top.change} ↑）`);
    }
    if (downs.length > 0) {
      const worst = downs.sort((a, b) => parseFloat(a.change) - parseFloat(b.change))[0];
      highlights.push(`「${worst.name}」${worst.current.toLocaleString()}${worst.unit}（环比 ${worst.change} ↓）`);
    }
    if (highlights.length > 0) {
      lines.push(`📈 核心指标：${highlights.join('；')}。`);
    }
  }

  const risk = data.riskSummary || {};
  const overdue = Number(risk.overdueCount ?? 0);
  const high = Number(risk.highRiskCount ?? 0);
  const stagnant = Number(risk.stagnantCount ?? 0);
  if (overdue + high + stagnant > 0) {
    const parts: string[] = [];
    if (overdue > 0) parts.push(`逾期 ${overdue} 单`);
    if (high > 0) parts.push(`高风险 ${high} 单`);
    if (stagnant > 0) parts.push(`停滞 ${stagnant} 单`);
    lines.push(`⚠️ 风险提示：${parts.join('，')}，建议优先跟进。`);
  } else {
    lines.push(`✅ 当前无逾期 / 高风险 / 停滞订单，整体平稳。`);
  }

  const ranking: any[] = Array.isArray(data.factoryRanking) ? data.factoryRanking : [];
  if (ranking.length > 0) {
    const top = ranking[0];
    lines.push(`🏭 产能 TOP1：${top.name || '未命名'}（扫码 ${top.scanCount} 次 / ${top.scanQty} 件）。`);
  }

  lines.push('');
  lines.push('下方看板展示完整数据，点击底部按钮可下载 Excel 完整版。');
  return lines.join('\n');
}

/** 规范化后端推送的 TraceableAdvice 载荷，校验失败返回 null */
export function normalizeTraceableAdvice(payload: unknown): Message['traceableAdvice'] | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    traceId: String(raw.traceId || ''),
    title,
    summary: String(raw.summary || '系统发来了一条智能建议。'),
    reasoningChain: Array.isArray(raw.reasoningChain)
      ? raw.reasoningChain.map(item => String(item || '')).filter(Boolean)
      : [],
    proposedActions: Array.isArray(raw.proposedActions)
      ? raw.proposedActions
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          label: String(item.label || '执行'),
          actionCommand: String(item.actionCommand || ''),
          actionParams: item.actionParams && typeof item.actionParams === 'object'
            ? item.actionParams as Record<string, unknown>
            : undefined,
          riskWarning: item.riskWarning != null ? String(item.riskWarning) : undefined,
        }))
      : [],
    confidenceScore: typeof raw.confidenceScore === 'number' ? raw.confidenceScore : undefined,
  };
}

/** 根据浮标边缘侧计算面板定位样式 */
export function computePanelStyle(
  triggerEdge: 'left' | 'right',
  width: number,
  height: number,
): CSSProperties {
  return {
    position: 'fixed' as const,
    zIndex: 9998,
    bottom: 16,
    width,
    height,
    ...(triggerEdge === 'left'
      ? { left: 16, transformOrigin: 'bottom left' }
      : { right: 16, transformOrigin: 'bottom right' }),
  };
}

/** 判断文件是否为图片 */
export function isImageFile(file: File): boolean {
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  return imageExts.includes(ext);
}

/** 判断文本是否为图片URL */
export function isImageUrl(text: string): boolean {
  const imageUrlPattern = /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i;
  return imageUrlPattern.test(text);
}

/** 从 URL search 参数中提取重要业务ID上下文 */
export function extractUrlParamContext(search: string): string[] {
  const searchParams = new URLSearchParams(search);
  const paramContext: string[] = [];
  for (const [k, v] of Array.from(searchParams.entries())) {
    if (['orderNo', 'styleId', 'orderId', 'styleNo', 'order', 'id', 'bundleId', 'batchId'].includes(k)) {
      paramContext.push(`${k}:${v}`);
    }
  }
  return paramContext;
}

/** 构建历史对话摘要提示 */
export function buildHistoryHint(messages: Message[]): string {
  const recentHistory = messages.slice(-5).filter(m => m.role === 'user').map(m => m.text).join(' | ');
  return recentHistory.length > 0
    ? `\n[历史对话摘要：${recentHistory.substring(0, 100)}...]`
    : '';
}

/** 从文本中检测报表类型 */
export function detectReportType(text: string): 'daily' | 'weekly' | 'monthly' | undefined {
  if (text.includes('日报')) return 'daily';
  if (text.includes('周报')) return 'weekly';
  if (text.includes('月报')) return 'monthly';
  return undefined;
}

interface BuildContextualTextOptions {
  pathname: string;
  search: string;
  messages: Message[];
  text: string;
  factoryId?: string | number;
  factoryName?: string;
}

/** 构建带页面上下文的完整对话文本 */
export function buildContextualText(options: BuildContextualTextOptions): string {
  const { pathname, search, messages, text, factoryId, factoryName } = options;

  const pageContext = getPageLabel(pathname);
  const paramContext = extractUrlParamContext(search);
  const suggestions = getPageSuggestions(pathname);

  const suggestionsHint = suggestions.length > 0
    ? `\n[页面快捷操作建议：${suggestions.slice(0, 3).join('；')}]`
    : '';

  const historyHint = buildHistoryHint(messages);

  const fullContext = pageContext
    ? `[当前页面:${pageContext}${paramContext.length > 0 ? ' | ' + paramContext.join(', ') : ''}]`
    : '';

  const visionHint = isImageUrl(text)
    ? '\n[系统提示：用户发送了一张图片URL，如果与服装相关，请主动调用视觉工具进行分析（款式识别/缺陷检测/色差检测/以图搜款）]'
    : '';

  if (factoryId) {
    return `${fullContext}[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${text}${visionHint}${suggestionsHint}${historyHint}`;
  }
  return `${fullContext}${text}${visionHint}${suggestionsHint}${historyHint}`;
}

/** 构建图片分析的上下文文本 */
export function buildImageContextText(
  question: string,
  factoryId: string | number | undefined,
  factoryName: string | undefined,
  hasServerImageUrl: boolean,
): string {
  const visionInstruction = hasServerImageUrl
    ? '\n[系统提示：用户上传了一张图片，请主动调用视觉工具进行分析（款式识别/缺陷检测/色差检测/以图搜款]'
    : '';
  const baseText = question || '请帮我分析这张图片';
  if (factoryId) {
    return `[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${baseText}${visionInstruction}`;
  }
  return `${baseText}${visionInstruction}`;
}

/** 校验文件类型和大小 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const allowed = ['.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp', '.bmp'];
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  if (!allowed.includes(ext)) {
    return { valid: false, error: '只支持 Excel（xlsx/xls）、CSV、图片和 PDF 文件' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: '文件大小不能超过 10MB' };
  }
  return { valid: true };
}

export function needsRiskAnalysis(text: string): boolean {
  return /风险|延期|逾期|交期|超期|risk|overdue|delay|模拟|推演|what.?if|预测|forecast/i.test(text);
}

export function needsOverdueFactory(text: string): boolean {
  return /逾期|延期|超期|overdue/i.test(text);
}

export function isAuthError(err: unknown): boolean {
  return typeof err === 'string' && (err.includes('401') || err.includes('登录已过期'));
}

/** 从 StepWizard 表单参数构建命令文本 */
export function buildWizardCommand(command: string, params: Record<string, unknown>): string {
  let p = command;
  Object.entries(params).forEach(([_k, v]) => {
    if (Array.isArray(v)) p += ' ' + v.join(',');
    else if (v !== undefined && v !== null && v !== '') p += ' ' + v;
  });
  return p;
}
