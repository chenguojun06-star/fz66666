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
  const n = normalizeStageKey(k);
  if (!n) return false;
  if (n.includes('入库')) return false;
  return n.includes('质检') || n.includes('检验') || n.includes('品检') || n.includes('验货');
}

function isCuttingStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('裁剪') || n.includes('裁床') || n.includes('剪裁') || n.includes('开裁');
}

function isProductionStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('生产');
}

function isSewingStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('车缝') || n.includes('缝制') || n.includes('缝纫') || n.includes('车工') || n.includes('整件');
}

function isWarehouseStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('入库') || n.includes('入仓') || n.includes('仓库') || n.includes('仓储');
}

function isTailStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n === '尾部' || n.includes('尾部') || n.includes('尾工');
}

function isSecondaryProcessStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('二次工艺') || n.includes('二次') || n.includes('绣花') || n.includes('印花') || n.includes('水洗') || n.includes('压花');
}

function isIroningStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('整烫') || n.includes('熨烫') || n.includes('大烫');
}

function isPackagingStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('包装') || n.includes('后整') || n.includes('打包') || n.includes('装箱');
}

// ── 工序名称 → 标准名映射 ──

const CANONICAL_STAGE_MAP = {
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
  '二次': '二次工艺',
  '后整理': '尾部',
  '后道': '尾部',
  '仓储': '入库',
  '上架': '入库',
  '进仓': '入库',
  '入仓': '入库',
  '验收': '入库',
  '成品入库': '入库',
};

function canonicalStageKey(k) {
  const n = normalizeStageKey(k);
  if (!n) return '';
  return normalizeStageKey(CANONICAL_STAGE_MAP[n] || n);
}

// ── scanType 推断 ──

const SCAN_TYPE_RULES = {
  '采购': 'production',
  '裁剪': 'cutting',
  '质检': 'quality',
  '入库': 'warehouse',
};

const VALID_SCAN_TYPES = new Set(['production', 'quality', 'warehouse', 'cutting']);

const DEFAULT_SCAN_TYPE = 'production';

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
  const canonical = canonicalStageKey(processName);
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
  const parts = (remark || '').split('|');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].indexOf('defectQty=') === 0) {
      const n = parseInt(parts[i].substring('defectQty='.length), 10);
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
  const allConfirmRecs = (scanHistory || []).filter(function(r) {
    return r && r.processCode === 'quality_receive' && r.scanResult === 'success' && r.confirmTime;
  });

  allConfirmRecs.sort(function(a, b) {
    return (a.confirmTime || '').localeCompare(b.confirmTime || '');
  });
  const confirmRec = allConfirmRecs.length > 0 ? allConfirmRecs[allConfirmRecs.length - 1] : null;

  const remarkStr = confirmRec ? String(confirmRec.remark || '') : '';
  const isUnqualified = !!(confirmRec && remarkStr.indexOf('unqualified') === 0);
  const defectQty = isUnqualified
    ? parseDefectQtyFromRemark(remarkStr, confirmRec.quantity)
    : 0;

  let handleMethod = '返修';
  if (isUnqualified) {
    const parts = remarkStr.split('|');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '报废' || parts[i] === '返修') {
        handleMethod = parts[i];
        break;
      }
    }
  }
  const isScrap = handleMethod === '报废';

  const expectedQty = Number(fallbackQty || 0) > 0 ? Number(fallbackQty || 0) : 0;

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
