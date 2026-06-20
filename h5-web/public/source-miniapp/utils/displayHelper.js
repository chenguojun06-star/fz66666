/**
 * 【H5 全系统统一显示层】Central Display Layer
 * 与 PC 端 utils/display.ts / 小程序 utils/displayHelper.js 保持完全一致
 */

const EMPTY_TEXT = '-';

/* ============== 状态映射（与 PC statusMaps.ts 对齐） ============== */

const STATUS_COLOR_DEFAULT = 'var(--color-border-antd)';
const STATUS_COLOR_SUCCESS = 'var(--color-success)';
const STATUS_COLOR_PROCESSING = 'var(--color-primary)';
const STATUS_COLOR_WARNING = 'var(--color-warning)';
const STATUS_COLOR_ERROR = 'var(--color-error)';
const STATUS_COLOR_BLUE = 'var(--color-info)';
const STATUS_COLOR_CYAN = 'var(--color-tertiary)';
const STATUS_COLOR_ORANGE = 'var(--color-warning-secondary)';
const STATUS_COLOR_VOLCANO = 'var(--color-error-secondary)';
const STATUS_COLOR_PURPLE = 'var(--color-purple)';
const STATUS_COLOR_GEEKBLUE = 'var(--color-geekblue)';

const ORDER_STATUS_LABEL = {
  not_started: '未开始',
  pending: '待生产',
  procurement: '物料采购',
  cutting: '裁剪中',
  sewing: '车缝中',
  secondary_process: '二次工艺',
  quality_check: '质检中',
  warehousing: '入库中',
  production: '生产中',
  in_progress: '生产中',
  completed: '已完成',
  confirmed: '已确认',
  draft: '草稿',
  produced: '已生产',
  warehoused: '已入库',
  delayed: '已逾期',
  scrapped: '已报废',
  cancelled: '已取消',
  canceled: '已取消',
  paused: '已暂停',
  returned: '已退回',
  closed: '已关单',
  archived: '已归档',
  ironing: '大烫',
  packaging: '包装',
  material_preparation: '备料中',
  received: '已领取',
  partial: '部分到货',
  partial_arrival: '部分到货',
  awaiting_confirm: '待确认',
  warehouse_pending: '待入库',
  pending_audit: '待初审',
  passed: '初审通过',
  bundled: '已成菲',
  created: '已创建',
};

const ORDER_STATUS_COLOR = {
  not_started: STATUS_COLOR_DEFAULT,
  pending: STATUS_COLOR_DEFAULT,
  procurement: STATUS_COLOR_BLUE,
  cutting: STATUS_COLOR_CYAN,
  sewing: STATUS_COLOR_CYAN,
  secondary_process: STATUS_COLOR_PURPLE,
  quality_check: STATUS_COLOR_GEEKBLUE,
  warehousing: STATUS_COLOR_GEEKBLUE,
  production: STATUS_COLOR_PROCESSING,
  in_progress: STATUS_COLOR_PROCESSING,
  completed: STATUS_COLOR_SUCCESS,
  confirmed: STATUS_COLOR_BLUE,
  draft: STATUS_COLOR_DEFAULT,
  produced: STATUS_COLOR_CYAN,
  warehoused: STATUS_COLOR_SUCCESS,
  delayed: STATUS_COLOR_WARNING,
  scrapped: STATUS_COLOR_ERROR,
  cancelled: STATUS_COLOR_DEFAULT,
  canceled: STATUS_COLOR_DEFAULT,
  paused: STATUS_COLOR_ORANGE,
  returned: STATUS_COLOR_VOLCANO,
  closed: STATUS_COLOR_BLUE,
  archived: STATUS_COLOR_DEFAULT,
  ironing: STATUS_COLOR_CYAN,
  packaging: STATUS_COLOR_GEEKBLUE,
  material_preparation: STATUS_COLOR_BLUE,
  received: STATUS_COLOR_BLUE,
  partial: STATUS_COLOR_CYAN,
  partial_arrival: STATUS_COLOR_CYAN,
  awaiting_confirm: STATUS_COLOR_BLUE,
  warehouse_pending: STATUS_COLOR_GEEKBLUE,
  pending_audit: STATUS_COLOR_BLUE,
  passed: STATUS_COLOR_SUCCESS,
  bundled: STATUS_COLOR_CYAN,
  created: STATUS_COLOR_DEFAULT,
};

/* ============== 工具函数 ============== */

function isEmpty(value) {
  if (value == null) return true;
  if (value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'number' && !isFinite(value)) return true;
  return false;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function toDate(input) {
  if (input == null) return null;
  if (input instanceof Date) {
    const t = input.getTime();
    return isNaN(t) ? null : new Date(t);
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  const raw = String(input).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/* ============== 日期格式化 ============== */

function formatDate(input) {
  const d = toDate(input);
  if (!d) return EMPTY_TEXT;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateTime(input) {
  const d = toDate(input);
  if (!d) return EMPTY_TEXT;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateTimeSecond(input) {
  const d = toDate(input);
  if (!d) return EMPTY_TEXT;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatMonthDay(input) {
  const d = toDate(input);
  if (!d) return EMPTY_TEXT;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatCompact(input) {
  const raw = typeof input === 'string' ? String(input).trim() : '';
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)) return formatMonthDay(input);
  const d = toDate(input);
  if (!d) return EMPTY_TEXT;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateRange(start, end) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s === EMPTY_TEXT && e === EMPTY_TEXT) return EMPTY_TEXT;
  return `${s} ~ ${e}`;
}

/* ============== 数字格式化 ============== */

function toMoney(v) {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(2) : '0.00';
}

function toMoneyLocale(v) {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function displayAmount(value, opts) {
  const withSymbol = opts && typeof opts.withSymbol === 'boolean' ? opts.withSymbol : true;
  const withLocale = opts && typeof opts.withLocale === 'boolean' ? opts.withLocale : false;
  if (isEmpty(value)) return withSymbol ? '¥0.00' : '0.00';
  if (withSymbol && withLocale) return '¥' + toMoneyLocale(value);
  if (withSymbol) return '¥' + toMoney(value);
  if (withLocale) return toMoneyLocale(value);
  return toMoney(value);
}

function displayQuantity(value) {
  if (isEmpty(value)) return EMPTY_TEXT;
  const n = Number(value);
  if (!isFinite(n)) return EMPTY_TEXT;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function displayNumber(value, decimals) {
  const d = typeof decimals === 'number' ? decimals : 2;
  if (isEmpty(value)) return EMPTY_TEXT;
  const n = Number(value);
  if (!isFinite(n)) return EMPTY_TEXT;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function displayPercent(value, decimals, isRatio) {
  const d = typeof decimals === 'number' ? decimals : 1;
  const ir = typeof isRatio === 'boolean' ? isRatio : true;
  if (isEmpty(value)) return EMPTY_TEXT;
  const n = Number(value);
  if (!isFinite(n)) return EMPTY_TEXT;
  return ir ? `${(n * 100).toFixed(d)}%` : `${n.toFixed(d)}%`;
}

/* ============== 状态文字/颜色 ============== */

function findStatus(key, mapLabel, mapColor) {
  const k = String(key || '').trim();
  if (!k) return null;
  const candidates = [k, k.toLowerCase(), k.toUpperCase()];
  for (const c of candidates) {
    if (mapLabel[c]) return { text: mapLabel[c], color: mapColor[c] || STATUS_COLOR_DEFAULT };
  }
  return null;
}

function displayStatus(status) {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: STATUS_COLOR_DEFAULT };
  const found = findStatus(status, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR);
  return found || { text: String(status), color: STATUS_COLOR_DEFAULT };
}

module.exports = {
  isEmpty,
  EMPTY_TEXT,
  formatDate,
  formatDateTime,
  formatDateTimeSecond,
  formatMonthDay,
  formatCompact,
  formatDateRange,
  displayAmount,
  displayQuantity,
  displayNumber,
  displayPercent,
  displayStatus,
  displayStatusText: (s) => displayStatus(s).text,
  displayStatusColor: (s) => displayStatus(s).color,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  STATUS_COLOR_DEFAULT,
  STATUS_COLOR_SUCCESS,
  STATUS_COLOR_PROCESSING,
  STATUS_COLOR_WARNING,
  STATUS_COLOR_ERROR,
  STATUS_COLOR_BLUE,
  STATUS_COLOR_CYAN,
  STATUS_COLOR_ORANGE,
  STATUS_COLOR_VOLCANO,
  STATUS_COLOR_PURPLE,
  STATUS_COLOR_GEEKBLUE,
};
