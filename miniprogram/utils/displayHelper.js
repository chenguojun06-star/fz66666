/**
 * 【小程序全系统统一显示层】Central Display Layer
 * 与 PC 端 utils/display.ts 保持完全一致的语义/格式/状态值映射
 *
 * 语义规范：
 *  • 空值占位："-"
 *  • 日期主格式：YYYY-MM-DD
 *  • 日期时间主格式：YYYY-MM-DD HH:mm
 *  • 短日期主格式：MM-DD
 *  • 金额主格式：¥1,234.56
 *  • 数量主格式：整数千分位
 *  • 百分比主格式：85.2%
 *  • 状态颜色：success/processing/warning/error/default (CSS: var(--color-success) 等)
 */

const EMPTY_TEXT = '-';

/* ============== 颜色常量 ============== */

const STATUS_COLOR_DEFAULT = 'var(--color-border)';
const STATUS_COLOR_SUCCESS = 'var(--color-success)';
const STATUS_COLOR_PROCESSING = 'var(--color-primary)';
const STATUS_COLOR_WARNING = 'var(--color-warning)';
const STATUS_COLOR_ERROR = 'var(--color-danger)';
const STATUS_COLOR_BLUE = 'var(--color-info)';
const STATUS_COLOR_CYAN = 'var(--color-tertiary)';
const STATUS_COLOR_ORANGE = 'var(--color-warning-secondary)';
const STATUS_COLOR_VOLCANO = 'var(--color-danger)';
const STATUS_COLOR_PURPLE = 'var(--color-purple)';
const STATUS_COLOR_GEEKBLUE = 'var(--color-geekblue)';

/* ============== 订单状态映射（与 PC statusMaps.ts 对齐） ============== */

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

/* ============== 质检状态映射 ============== */

const QUALITY_STATUS_LABEL = {
  qualified: '合格',
  unqualified: '不合格',
  repaired: '返修完成',
  pending: '待质检',
  checking: '质检中',
};

const QUALITY_STATUS_COLOR = {
  qualified: STATUS_COLOR_SUCCESS,
  unqualified: STATUS_COLOR_ERROR,
  repaired: STATUS_COLOR_DEFAULT,
  pending: STATUS_COLOR_WARNING,
  checking: STATUS_COLOR_PROCESSING,
};

/* ============== 采购状态映射 ============== */

const PURCHASE_STATUS_LABEL = {
  draft: '草稿',
  pending: '待采购',
  purchasing: '采购中',
  partial: '部分到货',
  partial_arrival: '部分到货',
  received: '已领取',
  completed: '已完成',
  cancelled: '已取消',
  confirmed: '已确认',
  awaiting_confirm: '待确认',
};

const PURCHASE_STATUS_COLOR = {
  draft: STATUS_COLOR_DEFAULT,
  pending: STATUS_COLOR_WARNING,
  purchasing: STATUS_COLOR_PROCESSING,
  partial: STATUS_COLOR_CYAN,
  partial_arrival: STATUS_COLOR_CYAN,
  received: STATUS_COLOR_BLUE,
  completed: STATUS_COLOR_SUCCESS,
  cancelled: STATUS_COLOR_DEFAULT,
  confirmed: STATUS_COLOR_BLUE,
  awaiting_confirm: STATUS_COLOR_BLUE,
};

/* ============== 退货状态映射 ============== */

const RETURN_STATUS_LABEL = {
  pending: '待审核',
  processing: '处理中',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝',
};

const RETURN_STATUS_COLOR = {
  pending: STATUS_COLOR_WARNING,
  processing: STATUS_COLOR_PROCESSING,
  completed: STATUS_COLOR_SUCCESS,
  cancelled: STATUS_COLOR_DEFAULT,
  rejected: STATUS_COLOR_ERROR,
};

/* ============== 缺陷类别映射 ============== */

const DEFECT_CATEGORY_LABEL = {
  appearance_integrity: '外观完整性问题',
  size_accuracy: '尺寸精度问题',
  process_compliance: '工艺规范性问题',
  functional_effectiveness: '功能有效性问题',
  other: '其他问题',
};

/* ============== 款式类别（CATEGORY）映射 ============== */

const CATEGORY_LABEL = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
  SPORT: '运动装',
  OUTDOOR: '户外装',
  HOME: '家居服',
};

/* ============== 季节（SEASON）映射 ============== */

const SEASON_LABEL = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  FALL: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
  ALL_SEASON: '全季',
};

/* ============== 款式来源（SOURCE）映射 ============== */

const SOURCE_LABEL = {
  SELF_DEVELOPED: '自主开发',
  OEM: '来料加工',
  CUSTOMER: '客供',
  LICENSED: '授权款',
};

/* ============== 工序名归一化映射（用于扫码页直接显示原始 processName） ============== */

/**
 * 工序名归一化：后端可能返回英文 code 或历史旧名称，统一映射为中文展示
 * 涵盖：扫码流程中的标准工序 + 质检两步领取/验收归一
 */
const PROCESS_NAME_NORMALIZE_MAP = {
  PRODUCTION: '车缝',
  SEWING: '车缝',
  CUTTING: '裁剪',
  PROCUREMENT: '采购',
  SECONDARY: '二次工艺',
  SECONDARY_PROCESS: '二次工艺',
  TAIL: '尾部',
  IRONING: '整烫',
  PACKAGING: '包装',
  WAREHOUSE: '入库',
  WAREHOUSE_IN: '入库',
  WAREHOUSE_OUT: '出库',
  WAREHOUSE_RETURN: '归还',
  QUALITY: '质检',
  QUALITY_CHECK: '质检',
  EMBROIDERY: '绣花',
  PRINTING: '印花',
  WASHING: '洗水',
  DYEING: '染色',
  PLEATING: '压褶',
  BEADING: '钉珠',
};

/**
 * 工序名归一化正则规则（兼容中文历史旧名）
 * - 质检领取/验收/确认 → 质检
 * - 大烫/整烫 → 整烫（保持一致）
 */
const PROCESS_NAME_NORMALIZE_RULES = [
  { regex: /^质检(领取|验收|确认)$/, replace: '质检' },
  { regex: /^大烫$/, replace: '整烫' },
];

/**
 * 归一化工序名
 * @param {string} name - 后端返回的 processName
 * @returns {string} 中文工序名（未匹配则原样返回）
 */
function normalizeProcessName(name) {
  if (isEmpty(name)) return '';
  const k = String(name).trim();
  if (!k) return '';
  // 1) 精确 code 匹配（大小写不敏感）
  const upper = k.toUpperCase();
  if (PROCESS_NAME_NORMALIZE_MAP[upper]) return PROCESS_NAME_NORMALIZE_MAP[upper];
  // 2) 正则归一
  for (let i = 0; i < PROCESS_NAME_NORMALIZE_RULES.length; i++) {
    const rule = PROCESS_NAME_NORMALIZE_RULES[i];
    if (rule.regex.test(k)) return rule.replace;
  }
  // 3) 已是中文/未知，原样返回
  return k;
}

/* ============== 拆菲状态（SPLIT_STATUS）映射 ============== */

const SPLIT_STATUS_LABEL = {
  PENDING: '待确认',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  CANCELED: '已取消',
  COMPLETED: '已完成',
};

const SPLIT_STATUS_COLOR = {
  PENDING: STATUS_COLOR_WARNING,
  APPROVED: STATUS_COLOR_SUCCESS,
  REJECTED: STATUS_COLOR_ERROR,
  CANCELLED: STATUS_COLOR_DEFAULT,
  CANCELED: STATUS_COLOR_DEFAULT,
  COMPLETED: STATUS_COLOR_SUCCESS,
};

/* ============== 通用枚举展示函数 ============== */

/**
 * 通用：从映射表取标签
 * @param {string} value - 原始值
 * @param {Object} map - 映射表（key 为大写）
 * @returns {string} 中文标签，未匹配则原值
 */
function _labelFromMap(value, map) {
  if (isEmpty(value)) return '';
  const k = String(value).trim();
  if (!k) return '';
  const candidates = [k, k.toUpperCase(), k.toLowerCase()];
  for (let i = 0; i < candidates.length; i++) {
    if (map[candidates[i]]) return map[candidates[i]];
  }
  return k;
}

function displayCategory(value) {
  return _labelFromMap(value, CATEGORY_LABEL);
}

function displaySeason(value) {
  return _labelFromMap(value, SEASON_LABEL);
}

function displaySource(value) {
  return _labelFromMap(value, SOURCE_LABEL);
}

function displaySplitStatus(status) {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: STATUS_COLOR_DEFAULT };
  const text = _labelFromMap(status, SPLIT_STATUS_LABEL);
  const color = SPLIT_STATUS_COLOR[String(status).trim().toUpperCase()] || STATUS_COLOR_DEFAULT;
  return { text, color };
}

/* ============== 基础工具函数 ============== */

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
  if (Array.isArray(input) && input.length >= 3) {
    const d = new Date(+input[0], +input[1] - 1, +input[2], +(input[3] || 0), +(input[4] || 0), +(input[5] || 0));
    return isNaN(d.getTime()) ? null : d;
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

/* ============== 进度计算 ============== */

/**
 * 安全计算百分比（防除零、防NaN）
 * @param {number} completed - 已完成数量
 * @param {number} total - 总数量
 * @param {number} decimals - 小数位数，默认0
 * @returns {string} 百分比文本，如 "85%"
 */
function calcProgressPercent(completed, total, decimals) {
  const d = typeof decimals === 'number' ? decimals : 0;
  const c = Number(completed) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return '0%';
  const pct = Math.min(100, (c / t) * 100);
  return `${pct.toFixed(d)}%`;
}

/**
 * 安全计算进度比例（0~1）
 * @param {number} completed
 * @param {number} total
 * @returns {number} 0~1 之间的比例
 */
function calcProgressRatio(completed, total) {
  const c = Number(completed) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.min(1, c / t);
}

/* ============== 交期统一提取 ============== */

/**
 * 从订单/款式对象中统一提取交期日期
 * 优先级：deliveryTime > deliveryDate > expectedShipDate > plannedEndDate > createTime
 * @param {Object} obj - 订单或款式对象
 * @returns {string} 格式化后的日期字符串
 */
function extractDeliveryDate(obj) {
  if (!obj) return EMPTY_TEXT;
  const candidates = [
    obj.deliveryTime,
    obj.deliveryDate,
    obj.expectedShipDate,
    obj.plannedEndDate,
    obj.planEndDate,
    obj.estimatedDate,
  ];
  for (const c of candidates) {
    if (!isEmpty(c)) {
      const d = toDate(c);
      if (d) return formatDate(d);
    }
  }
  return EMPTY_TEXT;
}

/**
 * 判断是否逾期
 * @param {Object} obj - 订单或款式对象
 * @param {string} status - 当前状态
 * @returns {boolean}
 */
function isOverdue(obj, status) {
  if (!obj) return false;
  // 已完成/已取消/已关单 不显示逾期
  if (status) {
    const s = String(status).toLowerCase();
    if (['completed', 'cancelled', 'canceled', 'closed', 'archived', 'scrapped'].includes(s)) {
      return false;
    }
  }
  const delivery = extractDeliveryDate(obj);
  if (delivery === EMPTY_TEXT) return false;
  const d = toDate(delivery);
  if (!d) return false;
  // 比较日期（忽略时间）
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deliveryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return deliveryDay < today;
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

function displayQualityStatus(status) {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: STATUS_COLOR_DEFAULT };
  const found = findStatus(status, QUALITY_STATUS_LABEL, QUALITY_STATUS_COLOR);
  return found || { text: String(status), color: STATUS_COLOR_DEFAULT };
}

function displayPurchaseStatus(status) {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: STATUS_COLOR_DEFAULT };
  const found = findStatus(status, PURCHASE_STATUS_LABEL, PURCHASE_STATUS_COLOR);
  return found || { text: String(status), color: STATUS_COLOR_DEFAULT };
}

function displayReturnStatus(status) {
  if (isEmpty(status)) return { text: EMPTY_TEXT, color: STATUS_COLOR_DEFAULT };
  const found = findStatus(status, RETURN_STATUS_LABEL, RETURN_STATUS_COLOR);
  return found || { text: String(status), color: STATUS_COLOR_DEFAULT };
}

function displayDefectCategory(category) {
  if (isEmpty(category)) return EMPTY_TEXT;
  const k = String(category).trim().toLowerCase();
  return DEFECT_CATEGORY_LABEL[k] || String(category);
}

/* ============== 导出 ============== */

module.exports = {
  // 空值
  isEmpty,
  EMPTY_TEXT,
  // 日期
  formatDate,
  formatDateTime,
  formatDateTimeSecond,
  formatMonthDay,
  formatCompact,
  formatDateRange,
  toDate,
  // 数字
  displayAmount,
  displayQuantity,
  displayNumber,
  displayPercent,
  // 进度
  calcProgressPercent,
  calcProgressRatio,
  // 交期
  extractDeliveryDate,
  isOverdue,
  // 状态
  displayStatus,
  displayStatusText: (s) => displayStatus(s).text,
  displayStatusColor: (s) => displayStatus(s).color,
  displayQualityStatus,
  displayQualityStatusText: (s) => displayQualityStatus(s).text,
  displayQualityStatusColor: (s) => displayQualityStatus(s).color,
  displayPurchaseStatus,
  displayPurchaseStatusText: (s) => displayPurchaseStatus(s).text,
  displayPurchaseStatusColor: (s) => displayPurchaseStatus(s).color,
  displayReturnStatus,
  displayReturnStatusText: (s) => displayReturnStatus(s).text,
  displayReturnStatusColor: (s) => displayReturnStatus(s).color,
  displayDefectCategory,
  // 款式/季节/来源/工序/拆菲
  displayCategory,
  displaySeason,
  displaySource,
  normalizeProcessName,
  displaySplitStatus,
  displaySplitStatusText: (s) => displaySplitStatus(s).text,
  displaySplitStatusColor: (s) => displaySplitStatus(s).color,
  // 完整映射
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  QUALITY_STATUS_LABEL,
  QUALITY_STATUS_COLOR,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_COLOR,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_COLOR,
  DEFECT_CATEGORY_LABEL,
  CATEGORY_LABEL,
  SEASON_LABEL,
  SOURCE_LABEL,
  PROCESS_NAME_NORMALIZE_MAP,
  SPLIT_STATUS_LABEL,
  SPLIT_STATUS_COLOR,
  // 颜色常量
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
