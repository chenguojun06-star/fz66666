export type ExportFormat = 'STANDARD' | 'KINGDEE' | 'UFIDA';

export const FORMAT_OPTIONS = [
  { value: 'STANDARD', label: '标准格式', desc: '通用 Excel，适合内部分析', icon: '📊' },
  { value: 'KINGDEE', label: '金蝶KIS', desc: '适配金蝶KIS/Wise导入', icon: '🦋' },
  { value: 'UFIDA', label: '用友T3', desc: '适配用友T3/U8导入', icon: '🔷' },
];

export const EXPORT_TYPES = [
  { value: 'payroll-detail', label: '工资结算明细', icon: '💰' },
  { value: 'invoice-detail', label: '发票台账明细', icon: '🧾' },
  { value: 'payable-detail', label: '应付账款明细', icon: '💳' },
  { value: 'finished-settlement', label: '成品结算明细', icon: '📦' },
  { value: 'material-reconciliation', label: '物料对账明细', icon: '🔄' },
];

export const INVOICE_TYPES = [
  { value: 'VAT_SPECIAL', label: '增值税专用发票' },
  { value: 'VAT_NORMAL', label: '增值税普通发票' },
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
  { value: 'PARTIAL', label: '部分付款', color: 'blue' },
  { value: 'PAID', label: '已付款', color: 'green' },
  { value: 'OVERDUE', label: '已逾期', color: 'red' },
];

export const RELATED_BIZ_TYPE_OPTIONS = [
  { value: 'PAYROLL_SETTLEMENT', label: '工资结算' },
  { value: 'FINISHED_SETTLEMENT', label: '成品结算' },
  { value: 'MATERIAL_RECONCILIATION', label: '物料对账' },
  { value: 'ORDER', label: '订单' },
  { value: 'OTHER', label: '其他' },
];

export const RELATED_BIZ_TYPE_MAP: Record<string, string> = {
  PAYROLL_SETTLEMENT: '工资结算',
  FINISHED_SETTLEMENT: '成品结算',
  MATERIAL_RECONCILIATION: '物料对账',
  ORDER: '订单',
  OTHER: '其他',
};

export const pageShellStyle: React.CSSProperties = {
  background: 'var(--bg-elevated, #fff)',
  borderRadius: 8,
  padding: 24,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

export const formatCurrency = (value?: number) => (Number(value || 0)).toFixed(2);
export const formatBizType = (value?: string) => RELATED_BIZ_TYPE_MAP[value || ''] || value || '-';
