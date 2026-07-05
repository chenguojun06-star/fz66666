/**
 * 【全系统统一显示层】Central Display Layer
 *
 * 所有页面/组件显示状态、日期、金额、空值时必须引用本文件。
 * 禁止在各组件/页面内 inline 实现状态映射、日期格式化、金额格式化、空值占位。
 *
 * 语义规范：
 *  • 空值占位：-（半角减号），禁用 "暂无" / "N/A" / "--" / "空"
 *  • 日期主格式：YYYY-MM-DD   （如 2026-06-20）
 *  • 日期时间主格式：YYYY-MM-DD HH:mm
 *  • 日期时间(秒)主格式：YYYY-MM-DD HH:mm:ss
 *  • 短日期主格式：MM-DD
 *  • 金额主格式：¥1,234.56（千分位 + 2 位小数，人民币符号）
 *  • 纯数字主格式：1,234.00（千分位 + 2 位小数）
 *  • 数量主格式：0 位小数（整数），千分位
 *  • 百分比主格式：85.2%（1 位小数）
 *  • 状态颜色：success=完成/已通过, processing=进行中, warning=逾期/警告, error=报废/错误, default=等待/草稿
 *  • 未匹配到的状态值：原样显示为 {text: value, color: default}
 */

import { formatDate, formatDateTime, formatDateTimeSecond, formatDateTimeCompact } from './datetime';
import { toMoney, toMoneyLocale, toPercent, toPercentRaw } from './format';
import {
  ORDER_STATUS_MAP,
  MATERIAL_PURCHASE_STATUS_MAP,
  SETTLEMENT_STATUS_MAP,
  PAYMENT_STATUS_MAP,
  PAYROLL_PAYMENT_STATUS_MAP,
  FACTORY_STATUS_MAP,
  FACTORY_TYPE_MAP,
  MATERIAL_STATUS_MAP,
  SECONDARY_PROCESS_STATUS_MAP,
  FACTORY_SHIPMENT_STATUS_MAP,
  CUTTING_BUNDLE_STATUS_MAP,
  CUTTING_TASK_STATUS_MAP,
  STYLE_ORDER_STATUS_MAP,
  AGENT_EXECUTION_STATUS_MAP,
  BIZ_TYPE_MAP,
  REVIEW_STATUS_MAP,
} from '@/constants/statusMaps';

/* ============================================================
 * 空值统一处理
 * ============================================================ */

const EMPTY_TEXT = '-';

export const isEmpty = (value: unknown): boolean => {
  if (value == null) return true;
  if (value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'number' && !Number.isFinite(value)) return true;
  return false;
};

/* ============================================================
 * 日期格式化（统一入口）
 * ============================================================ */

export type DateFormat = 'date' | 'datetime' | 'datetime-second' | 'compact' | 'month-day';

export const displayDate = (value: unknown, fmt: DateFormat = 'datetime'): string => {
  if (isEmpty(value)) return EMPTY_TEXT;
  switch (fmt) {
    case 'date':            return formatDate(value) || EMPTY_TEXT;
    case 'datetime':        return formatDateTime(value) || EMPTY_TEXT;
    case 'datetime-second': return formatDateTimeSecond(value) || EMPTY_TEXT;
    case 'compact':         return formatDateTimeCompact(value) || EMPTY_TEXT;
    case 'month-day': {
      const d = formatDate(value);
      if (!d || d === EMPTY_TEXT) return EMPTY_TEXT;
      // 将 YYYY-MM-DD 截为 MM-DD
      const parts = d.split('-');
      if (parts.length >= 3) return `${parts[1]}-${parts[2]}`;
      return d;
    }
    default: return formatDateTime(value) || EMPTY_TEXT;
  }
};

export const displayDateRange = (start: unknown, end: unknown): string => {
  const s = displayDate(start, 'date');
  const e = displayDate(end, 'date');
  if (s === EMPTY_TEXT && e === EMPTY_TEXT) return EMPTY_TEXT;
  return `${s} ~ ${e}`;
};

/* ============================================================
 * 数字格式化（统一入口）
 * ============================================================ */

export const displayAmount = (value: unknown, opts: { withSymbol?: boolean; withLocale?: boolean } = {}): string => {
  const { withSymbol = true, withLocale = false } = opts;
  if (isEmpty(value)) return withSymbol ? `¥0.00` : `0.00`;
  if (withSymbol && withLocale) return `¥${toMoneyLocale(value)}`;
  if (withSymbol) return `¥${toMoney(value)}`;
  if (withLocale) return toMoneyLocale(value);
  return toMoney(value);
};

export const displayQuantity = (value: unknown): string => {
  if (isEmpty(value)) return EMPTY_TEXT;
  const n = Number(value);
  if (!Number.isFinite(n)) return EMPTY_TEXT;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
};

export const displayNumber = (value: unknown, decimals = 2): string => {
  if (isEmpty(value)) return EMPTY_TEXT;
  const n = Number(value);
  if (!Number.isFinite(n)) return EMPTY_TEXT;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export const displayPercent = (value: unknown, decimals = 1, isRatio = true): string => {
  if (isEmpty(value)) return EMPTY_TEXT;
  if (isRatio) return toPercent(value, decimals);
  return toPercentRaw(value, decimals);
};

/* ============================================================
 * 状态映射（统一定位）
 * 大小写兼容 / trim 兼容 —— 优先精确 → 小写 → 大写 → 兜底
 * ============================================================ */

export type DisplayStatusItem = { text: string; color: string };

const findInMap = (map: Record<string, DisplayStatusItem>, key: string): DisplayStatusItem | null => {
  const k = key.trim();
  if (!k) return null;
  return map[k] ?? map[k.toLowerCase()] ?? map[k.toUpperCase()] ?? null;
};

/**
 * 通用订单状态（覆盖生产订单、工序状态、通用任务）
 */
export const displayOrderStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayMaterialPurchaseStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(MATERIAL_PURCHASE_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displaySettlementStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(SETTLEMENT_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayPaymentStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(PAYMENT_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayPayrollPaymentStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(PAYROLL_PAYMENT_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayFactoryStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(FACTORY_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayFactoryType = (t: unknown): DisplayStatusItem => {
  if (isEmpty(t)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(FACTORY_TYPE_MAP, String(t));
  return found ?? { text: '未知', color: 'default' };
};

export const displayMaterialStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(MATERIAL_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displaySecondaryProcessStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(SECONDARY_PROCESS_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayFactoryShipmentStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(FACTORY_SHIPMENT_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayStyleOrderStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(STYLE_ORDER_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayCuttingBundleStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(CUTTING_BUNDLE_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayCuttingTaskStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(CUTTING_TASK_STATUS_MAP, String(status))
             ?? findInMap(ORDER_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayAgentExecutionStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(AGENT_EXECUTION_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayBizType = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(BIZ_TYPE_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

export const displayReviewStatus = (status: unknown): DisplayStatusItem => {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: 'default' };
  const found = findInMap(REVIEW_STATUS_MAP, String(status));
  return found ?? { text: '未知', color: 'default' };
};

/* ============================================================
 * 状态变体映射（供组件调用处选择统一解析）
 * ============================================================ */

export type StatusVariant =
  | 'order'          // 生产订单 / 通用订单
  | 'purchase'       // 物料采购
  | 'settlement'     // 结算
  | 'payment'        // 支付
  | 'payroll'        // 工资条
  | 'factory'        // 工厂状态
  | 'factoryType'    // 工厂类型
  | 'material'       // 物料
  | 'secondary'      // 二次工艺
  | 'shipment'       // 外发工厂发货
  | 'style'          // 样衣/款式订单
  | 'agent'          // AI Agent 执行
  | 'biz'            // 业务类型
  | 'review'         // 审核
  | 'bundle'         // 裁剪菲
  | 'task';          // 裁剪任务

const variantDispatcher: Record<StatusVariant, (s: unknown) => DisplayStatusItem> = {
  order:       displayOrderStatus,
  purchase:    displayMaterialPurchaseStatus,
  settlement:  displaySettlementStatus,
  payment:     displayPaymentStatus,
  payroll:     displayPayrollPaymentStatus,
  factory:     displayFactoryStatus,
  factoryType: displayFactoryType,
  material:    displayMaterialStatus,
  secondary:   displaySecondaryProcessStatus,
  shipment:    displayFactoryShipmentStatus,
  style:       displayStyleOrderStatus,
  agent:       displayAgentExecutionStatus,
  biz:         displayBizType,
  review:      displayReviewStatus,
  bundle:      displayCuttingBundleStatus,
  task:        displayCuttingTaskStatus,
};

/**
 * 根据 variant 快速解析状态。返回 { text, color }
 */
export const resolveStatusByVariant = (status: unknown, variant: StatusVariant = 'order'): DisplayStatusItem => {
  const resolve = variantDispatcher[variant] ?? displayOrderStatus;
  return resolve(status);
};
