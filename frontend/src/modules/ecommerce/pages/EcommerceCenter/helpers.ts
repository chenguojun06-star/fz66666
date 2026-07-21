/** SmartStockTab 共享常量与纯函数 */

export const UrgencyColorMap: Record<string, string> = {
  urgent: 'red', high: 'orange', medium: 'blue', low: 'default',
};

/** 快递公司下拉选项 */
export const EXPRESS_COMPANY_OPTIONS = [
  { label: '顺丰', value: 'SF' },
  { label: '中通', value: 'ZTO' },
  { label: '圆通', value: 'YTO' },
  { label: '韵达', value: 'YD' },
  { label: '申通', value: 'STO' },
  { label: '极兔', value: 'JT' },
  { label: '邮政', value: 'EMS' },
  { label: '京东', value: 'JD' },
];

/** 赠品触发类型下拉选项 */
export const GIFT_TRIGGER_TYPE_OPTIONS = [
  { label: '按订单金额（≥阈值赠送）', value: 'AMOUNT' },
  { label: '按订单数量（≥阈值赠送）', value: 'QUANTITY' },
  { label: '按平台（指定平台赠送）', value: 'PLATFORM' },
];

/** 赠品触发平台下拉选项 */
export const GIFT_TRIGGER_PLATFORM_OPTIONS = [
  { label: '淘宝', value: 'TAOBAO' },
  { label: '天猫', value: 'TMALL' },
  { label: '京东', value: 'JD' },
  { label: '抖音', value: 'DOUYIN' },
  { label: '拼多多', value: 'PINDUODUO' },
  { label: '小红书', value: 'XIAOHONGSHU' },
];

/** 物流异常类型映射 */
export const ANOMALY_TYPE_MAP: Record<string, { color: string; label: string }> = {
  DELAY: { color: 'orange', label: '超时未签' },
  STALE: { color: 'red', label: '轨迹停滞' },
  EXCEPTION: { color: 'red', label: '轨迹异常' },
};

/** 账单差异类型映射 */
export const BILL_DIFF_TYPE_MAP: Record<string, { color: string; label: string }> = {
  MISSING_LOCAL: { color: 'orange', label: '本地缺失' },
  AMOUNT_MISMATCH: { color: 'red', label: '金额不符' },
};

/** 根据 AI 置信度返回 CSS 颜色变量 */
export function getConfidenceColor(conf: number | null | undefined): string {
  if (conf == null) return 'var(--color-text-quaternary)';
  if (conf >= 70) return 'var(--color-success)';
  if (conf >= 50) return 'var(--color-warning)';
  return 'var(--color-error)';
}

/** 物流异常严重度颜色 */
export function getSeverityColor(v: string): string {
  if (v === 'HIGH') return 'red';
  if (v === 'MEDIUM') return 'orange';
  return 'blue';
}

/** 账单状态标签文本 */
export function getBillStatusLabel(status: number): string {
  if (status === 1) return '确认';
  if (status === 2) return '申诉';
  return '忽略';
}
