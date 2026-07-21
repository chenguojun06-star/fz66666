/** DistributorTab 共享常量与下拉选项 */

/** 结算周期映射 */
export const CycleMap: Record<string, { color: string; label: string }> = {
  CASH: { color: 'green', label: '现结' },
  MONTHLY: { color: 'blue', label: '月结' },
  QUARTERLY: { color: 'purple', label: '季结' },
};

/** 分销商状态映射 */
export const StatusMap: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: 'success', label: '正常' },
  INACTIVE: { color: 'default', label: '停用' },
  FROZEN: { color: 'error', label: '冻结' },
};

/** 价格策略类型映射 */
export const PolicyTypeMap: Record<string, { color: string; label: string }> = {
  FIXED: { color: 'blue', label: '固定价' },
  DISCOUNT: { color: 'green', label: '折扣价' },
  TIERED: { color: 'orange', label: '阶梯价' },
};

/** B2B 订单状态映射 */
export const B2BOrderStatusMap: Record<number, { color: string; label: string }> = {
  0: { color: 'default', label: '待付款' },
  1: { color: 'orange', label: '待发货' },
  2: { color: 'blue', label: '已发货' },
  3: { color: 'success', label: '已完成' },
  4: { color: 'default', label: '已取消' },
};

/** 结算周期下拉选项 */
export const SETTLEMENT_CYCLE_OPTIONS = [
  { label: '现结', value: 'CASH' },
  { label: '月结', value: 'MONTHLY' },
  { label: '季结', value: 'QUARTERLY' },
];

/** 分销商状态下拉选项 */
export const DISTRIBUTOR_STATUS_OPTIONS = [
  { label: '正常', value: 'ACTIVE' },
  { label: '停用', value: 'INACTIVE' },
  { label: '冻结', value: 'FROZEN' },
];

/** 价格策略类型下拉选项 */
export const POLICY_TYPE_OPTIONS = [
  { label: '固定价（FIXED）', value: 'FIXED' },
  { label: '折扣价（DISCOUNT）', value: 'DISCOUNT' },
  { label: '阶梯价（TIERED）', value: 'TIERED' },
];

/** B2B 订单发货快递公司下拉选项 */
export const B2B_EXPRESS_COMPANY_OPTIONS = [
  { value: 'SF', label: '顺丰速运' },
  { value: 'STO', label: '申通快递' },
  { value: 'YTO', label: '圆通速递' },
  { value: 'ZTO', label: '中通快递' },
  { value: 'YD', label: '韵达快递' },
  { value: 'JT', label: '极兔速递' },
  { value: 'EMS', label: 'EMS' },
];

/** 分销账单处理状态标签文本 */
export function getBillHandleLabel(status: number): string {
  if (status === 1) return '确认';
  if (status === 2) return '申诉';
  return '忽略';
}
