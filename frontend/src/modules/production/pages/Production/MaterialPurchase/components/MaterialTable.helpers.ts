import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

/**
 * 清洗备注文本，移除"回料确认:"等系统标记。
 */
export const cleanRemark = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/(^|[；;]\s*)回料确认:[^；;]*/g, '')
    .replace(/^[；;\s]+|[；;\s]+$/g, '')
    .replace(/[；;\s]{2,}/g, ' ')
    .trim();
  return cleaned;
};

/**
 * 解析采购完成时间：优先回料确认时间，其次实际到货时间。
 */
export const resolveCompletedTime = (record: MaterialPurchaseType) => {
  return record.returnConfirmTime || record.actualArrivalDate || '';
};

/**
 * 解析操作员名称：优先回料确认人，其次领料人。
 */
export const resolveOperatorName = (record: MaterialPurchaseType) => {
  return String(record.returnConfirmerName || '').trim() || String(record.receiverName || '').trim();
};

/** 订单业务类型对应的 Tag 颜色映射 */
export const BIZ_TYPE_COLOR_MAP: Record<string, string> = {
  FOB: 'cyan',
  ODM: 'purple',
  OEM: 'blue',
  CMT: 'orange',
};

/** 对账状态映射（文本 + 颜色） */
export const RECONCILIATION_STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待核对', color: 'orange' },
  verified: { text: '已核对', color: 'blue' },
  approved: { text: '已审批', color: 'cyan' },
  paid: { text: '已付款', color: 'green' },
  rejected: { text: '已驳回', color: 'red' },
};
