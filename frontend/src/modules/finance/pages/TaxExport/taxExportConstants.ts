import React from 'react';

export type ExportFormat = 'STANDARD' | 'KINGDEE' | 'UFIDA';

export const FORMAT_OPTIONS = [
  { label: '通用标准格式', value: 'STANDARD' as ExportFormat, desc: '基础 Excel，适合所有财务软件手工导入', free: true },
  { label: '金蝶 KIS 格式', value: 'KINGDEE' as ExportFormat, desc: '金蝶KIS凭证导入格式，直接粘贴无需调整', free: false },
  { label: '用友 T3 格式', value: 'UFIDA' as ExportFormat, desc: '用友T3凭证导入格式，直接粘贴无需调整', free: false },
];

export const EXPORT_TYPES = [
  { key: 'payroll', title: '工资结算汇总', desc: '导出指定周期内所有结算单数据，含结算金额、操作工姓名、工序明细', icon: '', color: '#52c41a' },
  { key: 'material', title: '物料对账单', desc: '导出面辅料采购、出入库、对账数据，与供应商对账一目了然', icon: '', color: '#1890ff' },
  { key: 'supplier-payment', title: '供应商付款汇总', desc: '导出应付账款、已付款、逾期明细，便于对账审计及供应商信用评估', icon: '', color: '#722ed1' },
  { key: 'tax-summary', title: '月度税务汇总', desc: '导出本期开票金额、税种税率、税额合计，可直接用于月度税务申报附表', icon: '', color: '#fa8c16' },
];

export const INVOICE_TYPES = [
  { value: 'VAT_SPECIAL', label: '增值税专用发票' },
  { value: 'VAT_GENERAL', label: '增值税普通发票' },
  { value: 'ELECTRONIC', label: '电子发票' },
  { value: 'RECEIPT', label: '收据' },
];

export const INVOICE_STATUS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'ISSUED', label: '已开票', color: 'green' },
  { value: 'CANCELLED', label: '已作废', color: 'red' },
];

export const PAYABLE_STATUS = [
  { value: 'PENDING', label: '待付款', color: 'orange' },
  { value: 'PAID', label: '已付款', color: 'green' },
  { value: 'OVERDUE', label: '已逾期', color: 'red' },
  { value: 'PARTIAL', label: '部分付款', color: 'blue' },
];

export const RELATED_BIZ_TYPE_OPTIONS = [
  { value: 'SETTLEMENT', label: '结算单' },
  { value: 'RECONCILIATION', label: '对账单' },
  { value: 'REIMBURSEMENT', label: '报销单' },
  { value: 'ORDER', label: '订单' },
];

export const RELATED_BIZ_TYPE_MAP: Record<string, string> = {
  SETTLEMENT: '结算单',
  RECONCILIATION: '对账单',
  REIMBURSEMENT: '报销单',
  ORDER: '订单',
};

export const pageShellStyle: React.CSSProperties = {
  padding: '12px 0 32px',
};

export const formatCurrency = (value?: number) => (Number(value || 0)).toFixed(2);
export const formatBizType = (value?: string) => RELATED_BIZ_TYPE_MAP[value || ''] || value || '-';
