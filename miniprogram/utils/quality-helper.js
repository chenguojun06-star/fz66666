/**
 * 质检状态推断与分类工具
 * 统一小程序各页面的质检状态计算，避免多端不一致
 */

var CATEGORY_TEXT = {
  pending: '待检',
  qualified: '合格',
  unqualified: '不合格',
  repaired: '返修完成',
  repair: '返修中',
};

var CATEGORY_TAG_CLASS = {
  pending: 'tag-default',
  qualified: 'tag-success',
  unqualified: 'tag-danger',
  repaired: 'tag-info',
  repair: 'tag-warning',
};

var REPAIR_STATUS_MAP = {
  pending: '待返修',
  pending_repair: '待返修',
  repairing: '返修中',
  repair_done: '返修完成',
  scrapped: '已报废',
};

var DEFECT_CATEGORY_MAP = {
  // 旧版中文 key
  fabric: '面料问题',
  sewing: '缝制问题',
  trimming: '辅料问题',
  stain: '污渍问题',
  size: '尺寸问题',
  other: '其他问题',
  // 新版英文 key（与 quality-detail DEFECT_CATEGORY_OPTIONS 对齐）
  appearance_integrity: '外观完整性',
  size_accuracy: '尺寸精度',
  process_compliance: '工艺规范性',
  functional_effectiveness: '功能有效性',
  appearance: '外观完整性',
  process: '工艺规范性',
  functional: '功能有效性',
};

/**
 * 质检分类推断
 * 优先级：返修状态 > 质检结果 > 扫码结果 > 质检阶段
 */
function getQualityCategory(item) {
  if (!item) return 'pending';
  if (item.repairStatus === 'pending' || item.repairStatus === 'pending_repair') return 'repair';
  if (item.repairStatus === 'repairing') return 'repair';
  if (item.repairStatus === 'repair_done') return 'repair';
  if (item.repairStatus === 'scrapped') return 'unqualified';
  if (item.qualityResult === 'qualified' || item.qualityStatus === 'qualified') return 'qualified';
  if (item.qualityResult === 'unqualified' || item.qualityStatus === 'unqualified') return 'unqualified';
  if (item.qualityResult === 'repaired' || item.qualityStatus === 'repaired') return 'repaired';
  if (item.scanResult === 'success') return 'qualified';
  if (item.scanResult === 'fail') return 'unqualified';
  if (item.qualityStage === 'receive') return 'pending';
  return 'pending';
}

function getCategoryText(category) {
  return CATEGORY_TEXT[category] || '待检';
}

function getCategoryTagClass(category) {
  return CATEGORY_TAG_CLASS[category] || 'tag-default';
}

function getRepairStatusText(status) {
  return REPAIR_STATUS_MAP[status] || status || '';
}

function getDefectCategoryText(category) {
  return DEFECT_CATEGORY_MAP[category] || category || '';
}

module.exports = {
  getQualityCategory: getQualityCategory,
  getCategoryText: getCategoryText,
  getCategoryTagClass: getCategoryTagClass,
  getRepairStatusText: getRepairStatusText,
  getDefectCategoryText: getDefectCategoryText,
  CATEGORY_TEXT: CATEGORY_TEXT,
  CATEGORY_TAG_CLASS: CATEGORY_TAG_CLASS,
  REPAIR_STATUS_MAP: REPAIR_STATUS_MAP,
  DEFECT_CATEGORY_MAP: DEFECT_CATEGORY_MAP,
};
