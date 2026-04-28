/**
 * 跨端共享 — 工序检测纯逻辑
 *
 * 供小程序 StageDetector.js 和前端 stageMapping.ts 复用。
 * 本文件不依赖任何平台 API（wx / DOM / fetch），仅包含纯函数和常量。
 *
 * @module shared/stageDetection
 */

// ── 工序名称规范化 ──

function normalizeStageKey(v) {
  return String(v || '').trim().replace(/\s+/g, '');
}

// ── 工序类型判定 ──

function isQualityStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  if (n.includes('入库')) return false;
  return n.includes('质检') || n.includes('检验') || n.includes('品检') || n.includes('验货');
}

function isCuttingStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('裁剪') || n.includes('裁床') || n.includes('剪裁') || n.includes('开裁');
}

function isProductionStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('生产');
}

function isSewingStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('车缝') || n.includes('缝制') || n.includes('缝纫') || n.includes('车工') || n.includes('整件');
}

function isWarehouseStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('入库') || n.includes('入仓') || n.includes('仓库') || n.includes('仓储');
}

function isTailStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n === '尾部' || n.includes('尾部') || n.includes('尾工');
}

function isSecondaryProcessStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('二次工艺') || n.includes('二次') || n.includes('绣花') || n.includes('印花') || n.includes('水洗') || n.includes('压花');
}

function isIroningStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('整烫') || n.includes('熨烫') || n.includes('大烫');
}

function isPackagingStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('包装') || n.includes('后整') || n.includes('打包') || n.includes('装箱');
}

// ── 工序名称 → 标准名映射 ──

var CANONICAL_STAGE_MAP = {
  '订单创建': '下单',
  '创建订单': '下单',
  '开单': '下单',
  '制单': '下单',
  '物料采购': '采购',
  '面辅料采购': '采购',
  '备料': '采购',
  '到料': '采购',
  '进料': '采购',
  '物料': '采购',
  '缝制': '车缝',
  '缝纫': '车缝',
  '车工': '车缝',
  '整件': '车缝',
  '生产': '车缝',
  '制作': '车缝',
  '车间生产': '车缝',
  '裁床': '裁剪',
  '剪裁': '裁剪',
  '开裁': '裁剪',
  '裁片': '裁剪',
  '裁切': '裁剪',
  '绣花': '二次工艺',
  '印花': '二次工艺',
  '水洗': '二次工艺',
  '压花': '二次工艺',
  '烫钻': '二次工艺',
  '烫画': '二次工艺',
  '钉珠': '二次工艺',
  '烫金': '二次工艺',
  '数码印': '二次工艺',
  '打孔': '二次工艺',
  '激光': '二次工艺',
  '转印': '二次工艺',
  '植绒': '二次工艺',
  '涂层': '二次工艺',
  '磨毛': '二次工艺',
  '染色': '二次工艺',
  '后处理': '二次工艺',
  '大烫': '尾部',
  '整烫': '尾部',
  '熨烫': '尾部',
  '烫整': '尾部',
  '后整烫': '尾部',
  '剪线': '尾部',
  '锁边': '尾部',
  '检验': '尾部',
  '品检': '尾部',
  '验货': '尾部',
  'QC': '尾部',
  '品控': '尾部',
  '检查': '尾部',
  '后整': '尾部',
  '打包': '尾部',
  '装箱': '尾部',
  '封箱': '尾部',
  '贴标': '尾部',
  '质检入库': '入库',
  '入仓': '入库',
  '仓库': '入库',
  '仓储': '入库',
  '上架': '入库',
  '进仓': '入库',
  '入库质检': '入库',
  '成品入库': '入库',
  '完工入库': '入库',
  '发货': '出货',
  '发运': '出货',
};

function canonicalStageKey(k) {
  var n = normalizeStageKey(k);
  if (!n) return '';
  return normalizeStageKey(CANONICAL_STAGE_MAP[n] || n);
}

// ── scanType 推断 ──

var SCAN_TYPE_RULES = {
  '采购': 'production',
  '裁剪': 'cutting',
  '质检': 'quality',
  '入库': 'warehouse',
};

var VALID_SCAN_TYPES = new Set(['production', 'quality', 'warehouse', 'cutting']);

var DEFAULT_SCAN_TYPE = 'production';

/**
 * 根据工序名称/进度阶段推断 scanType
 * @param {string} processName - 工序名
 * @param {string} [progressStage] - 父进度阶段
 * @param {string} [backendScanType] - 后端已返回的 scanType
 * @returns {string}
 */
function inferScanType(processName, progressStage, backendScanType) {
  if (backendScanType && VALID_SCAN_TYPES.has(backendScanType)) {
    return backendScanType;
  }
  if (SCAN_TYPE_RULES[processName]) {
    return SCAN_TYPE_RULES[processName];
  }
  if (progressStage && SCAN_TYPE_RULES[progressStage]) {
    return SCAN_TYPE_RULES[progressStage];
  }
  var canonical = canonicalStageKey(processName);
  if (SCAN_TYPE_RULES[canonical]) {
    return SCAN_TYPE_RULES[canonical];
  }
  if (isQualityStageKey(processName)) return 'quality';
  if (isCuttingStageKey(processName)) return 'cutting';
  if (isWarehouseStageKey(processName)) return 'warehouse';
  return DEFAULT_SCAN_TYPE;
}

// ── 质检相关 ──

/**
 * 从质检验收 remark 中解析次品件数
 * remark 格式：unqualified|[category]|[remark]|defectQty=N
 * @param {string} remark
 * @param {number} fallbackQty
 * @returns {number}
 */
function parseDefectQtyFromRemark(remark, fallbackQty) {
  if (!remark) return fallbackQty || 0;
  var parts = (remark || '').split('|');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].indexOf('defectQty=') === 0) {
      var n = parseInt(parts[i].substring('defectQty='.length), 10);
      if (n > 0) return n;
    }
  }
  return fallbackQty || 0;
}

/**
 * 从扫码历史中提取质检元数据
 * @param {Array} scanHistory - 扫码记录
 * @param {number} fallbackQty - 兜底数量
 * @returns {{ isUnqualified: boolean, defectQty: number, handleMethod: string, isScrap: boolean, defectRemark: string, expectedQty: number }}
 */
function extractQualityMeta(scanHistory, fallbackQty) {
  var allConfirmRecs = (scanHistory || []).filter(function(r) {
    return r && r.processCode === 'quality_receive' && r.scanResult === 'success' && r.confirmTime;
  });

  allConfirmRecs.sort(function(a, b) {
    return (a.confirmTime || '').localeCompare(b.confirmTime || '');
  });
  var confirmRec = allConfirmRecs.length > 0 ? allConfirmRecs[allConfirmRecs.length - 1] : null;

  var remarkStr = confirmRec ? String(confirmRec.remark || '') : '';
  var isUnqualified = !!(confirmRec && remarkStr.indexOf('unqualified') === 0);
  var defectQty = isUnqualified
    ? parseDefectQtyFromRemark(remarkStr, confirmRec.quantity)
    : 0;

  var handleMethod = '返修';
  if (isUnqualified) {
    var parts = remarkStr.split('|');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '报废' || parts[i] === '返修') {
        handleMethod = parts[i];
        break;
      }
    }
  }
  var isScrap = handleMethod === '报废';

  var expectedQty = Number(fallbackQty || 0) > 0 ? Number(fallbackQty || 0) : 0;

  return {
    isUnqualified: isUnqualified,
    defectQty: defectQty,
    handleMethod: handleMethod,
    isScrap: isScrap,
    defectRemark: isUnqualified ? remarkStr : '',
    expectedQty: expectedQty,
  };
}

// ── 导出 ──

module.exports = {
  normalizeStageKey: normalizeStageKey,
  isQualityStageKey: isQualityStageKey,
  isCuttingStageKey: isCuttingStageKey,
  isProductionStageKey: isProductionStageKey,
  isSewingStageKey: isSewingStageKey,
  isWarehouseStageKey: isWarehouseStageKey,
  isTailStageKey: isTailStageKey,
  isSecondaryProcessStageKey: isSecondaryProcessStageKey,
  isIroningStageKey: isIroningStageKey,
  isPackagingStageKey: isPackagingStageKey,
  CANONICAL_STAGE_MAP: CANONICAL_STAGE_MAP,
  canonicalStageKey: canonicalStageKey,
  SCAN_TYPE_RULES: SCAN_TYPE_RULES,
  VALID_SCAN_TYPES: VALID_SCAN_TYPES,
  DEFAULT_SCAN_TYPE: DEFAULT_SCAN_TYPE,
  inferScanType: inferScanType,
  parseDefectQtyFromRemark: parseDefectQtyFromRemark,
  extractQualityMeta: extractQualityMeta,
};
