/**
 * 通用枚举映射工具（与 PC 端 materialType.ts 及后端枚举对齐）
 * 统一处理英文字段 → 中文显示，避免各页面重复定义和英文泄漏
 */

// ── 物料类型映射（与 PC 端 getMaterialTypeLabel 一致） ──
var MATERIAL_TYPE_MAP = {
  fabric: '面料',
  fabricA: '面料A',
  fabricB: '面料B',
  fabricC: '面料C',
  fabricD: '面料D',
  fabricE: '面料E',
  lining: '里料',
  liningA: '里料A',
  liningB: '里料B',
  liningC: '里料C',
  liningD: '里料D',
  liningE: '里料E',
  accessory: '辅料',
  accessoryA: '辅料A',
  accessoryB: '辅料B',
  accessoryC: '辅料C',
  accessoryD: '辅料D',
  accessoryE: '辅料E',
  other: '其他',
};

// ── 二次工艺类型映射（后端 SecondaryProcess.processType） ──
var PROCESS_TYPE_MAP = {
  embroidery: '绣花',
  printing: '印花',
  washing: '洗水',
  dyeing: '染色',
  ironing: '整烫',
  pleating: '压褶',
  beading: '钉珠',
  other: '其他',
};

// ── 二次工艺状态映射（后端 SecondaryProcess.status） ──
var PROCESS_STATUS_MAP = {
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  APPROVED: '已审核',
  REWORK: '需返修',
  REJECTED: '审核不通过',
};

// ── 样衣生产状态映射（后端 PatternProduction.status） ──
var PATTERN_STATUS_MAP = {
  PENDING: '待领取',
  RECEIVED: '已领取',
  IN_PROGRESS: '制作中',
  PRODUCTION_COMPLETED: '生产完成',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
  WAREHOUSE_OUT: '已出库',
  WAREHOUSE_RETURN: '已归还',
  SCRAPPED: '已报废',
};

// ── 订单状态映射 ──
var ORDER_STATUS_MAP = {
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  ENABLED: '启用',
  DISABLED: '停用',
};

// ── 审核状态映射 ──
var REVIEW_STATUS_MAP = {
  PENDING: '待审核',
  APPROVED: '审核通过',
  REWORK: '需返修',
  REJECTED: '审核不通过',
  PASS: '审核通过',
};

// ── 采购任务状态映射 ──
var PROCUREMENT_STATUS_MAP = {
  PENDING: '待采购',
  IN_PROGRESS: '采购中',
  COMPLETED: '已采购',
  CANCELLED: '已取消',
  WAREHOUSE_IN: '已入库',
};

// ── 质检状态映射 ──
var QUALITY_STATUS_MAP = {
  pending: '待质检',
  qualified: '合格',
  unqualified: '不合格',
  rework: '返工',
  QUALIFIED: '合格',
  UNQUALIFIED: '不合格',
  REWORK: '返工',
  PENDING: '待质检',
};

/**
 * 通用映射函数：按 map 查找，未命中返回原值或 '-'
 * @param {string} value - 原始值
 * @param {Object} map - 映射表
 * @param {string} fallback - 未命中时的回退值（默认 '-'）
 */
function mapLabel(value, map, fallback) {
  if (!value) return fallback || '-';
  var raw = String(value).trim();
  // 精确匹配
  if (map[raw]) return map[raw];
  // 大小写不敏感匹配
  var lower = raw.toLowerCase();
  for (var key in map) {
    if (Object.prototype.hasOwnProperty.call(map, key) && key.toLowerCase() === lower) {
      return map[key];
    }
  }
  return fallback || raw;
}

/** 物料类型 → 中文 */
function materialTypeLabel(v) {
  return mapLabel(v, MATERIAL_TYPE_MAP);
}

/** 二次工艺类型 → 中文 */
function processTypeLabel(v) {
  return mapLabel(v, PROCESS_TYPE_MAP);
}

/** 二次工艺状态 → 中文 */
function processStatusLabel(v) {
  return mapLabel(v, PROCESS_STATUS_MAP);
}

/** 样衣状态 → 中文 */
function patternStatusLabel(v) {
  return mapLabel(v, PATTERN_STATUS_MAP);
}

/** 订单状态 → 中文 */
function orderStatusLabel(v) {
  return mapLabel(v, ORDER_STATUS_MAP);
}

/** 审核状态 → 中文 */
function reviewStatusLabel(v) {
  return mapLabel(v, REVIEW_STATUS_MAP);
}

/** 采购状态 → 中文 */
function procurementStatusLabel(v) {
  return mapLabel(v, PROCUREMENT_STATUS_MAP);
}

/** 质检状态 → 中文 */
function qualityStatusLabel(v) {
  return mapLabel(v, QUALITY_STATUS_MAP);
}

/**
 * 给 BOM 列表每项补充中文显示字段
 * 添加 materialTypeText / processTypeText / statusText
 */
function enrichBomList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (item) {
    var copy = Object.assign({}, item);
    if (item.materialType) {
      copy.materialTypeText = materialTypeLabel(item.materialType);
    }
    if (item.processType) {
      copy.processTypeText = processTypeLabel(item.processType);
    }
    if (item.status) {
      copy.statusText = processStatusLabel(item.status);
    }
    return copy;
  });
}

module.exports = {
  MATERIAL_TYPE_MAP: MATERIAL_TYPE_MAP,
  PROCESS_TYPE_MAP: PROCESS_TYPE_MAP,
  PROCESS_STATUS_MAP: PROCESS_STATUS_MAP,
  PATTERN_STATUS_MAP: PATTERN_STATUS_MAP,
  ORDER_STATUS_MAP: ORDER_STATUS_MAP,
  REVIEW_STATUS_MAP: REVIEW_STATUS_MAP,
  PROCUREMENT_STATUS_MAP: PROCUREMENT_STATUS_MAP,
  QUALITY_STATUS_MAP: QUALITY_STATUS_MAP,
  mapLabel: mapLabel,
  materialTypeLabel: materialTypeLabel,
  processTypeLabel: processTypeLabel,
  processStatusLabel: processStatusLabel,
  patternStatusLabel: patternStatusLabel,
  orderStatusLabel: orderStatusLabel,
  reviewStatusLabel: reviewStatusLabel,
  procurementStatusLabel: procurementStatusLabel,
  qualityStatusLabel: qualityStatusLabel,
  enrichBomList: enrichBomList,
};
