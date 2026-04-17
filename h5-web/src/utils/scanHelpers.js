const MATERIAL_TYPE_MAP = {
  fabricA: '主面料', fabricB: '辅面料', liningA: '里料', liningB: '夹里', liningC: '衬布/粘合衬',
  accessoryA: '拉链', accessoryB: '纽扣', accessoryC: '配件',
};

const SCAN_TYPE_MAP = {
  production: '生产', cutting: '裁剪', procurement: '采购', quality: '质检',
  pressing: '大烫', packaging: '包装', warehousing: '入库', sewing: '车缝', carSewing: '车缝',
};

const ORDER_STATUS_MAP = {
  completed: '已完成', closed: '已关单', archived: '已归档', production: '生产中',
  pending: '待生产', delayed: '已逾期', scrapped: '已报废', cancelled: '已取消',
  canceled: '已取消', paused: '已暂停', returned: '已退回',
};

const PRODUCTION_STAGES = [
  'procurement', 'cutting', 'sewing', 'carSewing', 'pressing',
  'quality', 'packaging', 'warehousing',
];

const STAGE_LABELS = {
  procurement: '采购', cutting: '裁剪', sewing: '车缝', carSewing: '车缝',
  pressing: '大烫', quality: '质检', packaging: '包装', warehousing: '入库',
  pattern: '样板', material: '物料',
};

function normalizeScanType(progressStage, scanType) {
  const stage = String(progressStage || '').trim();
  if (stage === 'quality' || stage === '质检') return 'quality';
  if (stage === 'warehouse' || stage === '入库') return 'warehousing';
  if (stage === 'cutting' || stage === '裁剪') return 'cutting';
  if (stage === 'procurement' || stage === '采购') return 'procurement';
  if (stage === 'packaging' || stage === '包装') return 'packaging';
  return scanType || 'production';
}

function scanTypeText(raw) {
  const v = String(raw || '').trim();
  if (!v) return '-';
  return SCAN_TYPE_MAP[v] || STAGE_LABELS[v] || v;
}

function orderStatusText(status) {
  const s = String(status || '').toLowerCase();
  return ORDER_STATUS_MAP[s] || s || '-';
}

function canUndo(record, isAdmin) {
  if (!record.scanTime && !record.createTime) return false;
  const t = new Date(record.scanTime || record.createTime).getTime();
  const windowMs = isAdmin ? 5 * 3600000 : 30 * 60000;
  return Date.now() - t < windowMs && (record.scanResult || '').toLowerCase() === 'success';
}

function parseBundleCode(code) {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  const bundlePattern = /^(PO\d{8}\d*)-(ST\d+)-(.+?)-([^-]+?)-(\d+)-(\d{2})$/;
  const match = trimmed.match(bundlePattern);
  if (match) {
    return {
      type: 'bundle',
      orderNo: match[1],
      styleNo: match[2],
      color: match[3],
      size: match[4],
      quantity: parseInt(match[5], 10),
      bundleSeq: match[6],
      raw: trimmed,
    };
  }
  const orderPattern = /^(PO\d{8}\d*)$/;
  const orderMatch = trimmed.match(orderPattern);
  if (orderMatch) {
    return { type: 'order', orderNo: orderMatch[1], raw: trimmed };
  }
  try {
    const json = JSON.parse(trimmed);
    if (json.orderNo || json.scanCode || json.bundleNo) {
      return { type: 'json', ...json, raw: trimmed };
    }
  } catch (_) {}
  if (trimmed.startsWith('http') && trimmed.includes('orderNo=')) {
    const url = new URL(trimmed);
    const orderNo = url.searchParams.get('orderNo');
    const styleNo = url.searchParams.get('styleNo');
    if (orderNo) return { type: 'url', orderNo, styleNo, raw: trimmed };
  }
  if (/^MR/i.test(trimmed) || /^U/i.test(trimmed)) {
    return { type: trimmed.startsWith('MR') ? 'materialRoll' : 'unbundled', raw: trimmed };
  }
  return { type: 'unknown', raw: trimmed };
}

function validateBundleForStage(parsedCode, expectedStage) {
  if (!parsedCode) return { valid: false, reason: '无效的扫码内容' };
  if (parsedCode.type === 'bundle') {
    if (!parsedCode.orderNo || !parsedCode.styleNo) {
      return { valid: false, reason: '菲号格式不完整，缺少订单号或款号' };
    }
    if (!parsedCode.quantity || parsedCode.quantity <= 0) {
      return { valid: false, reason: '菲号数量无效' };
    }
    const productionStages = ['sewing', 'carSewing', 'pressing', 'quality', 'packaging', 'warehousing'];
    if (productionStages.includes(expectedStage)) {
      return { valid: true, reason: '' };
    }
    return { valid: false, reason: `菲号不适用于${STAGE_LABELS[expectedStage] || expectedStage}阶段，生产环节请使用菲号扫码` };
  }
  if (parsedCode.type === 'order') {
    const orderStages = ['procurement', 'cutting'];
    if (orderStages.includes(expectedStage)) {
      return { valid: true, reason: '' };
    }
    return { valid: false, reason: `订单二维码不适用于${STAGE_LABELS[expectedStage] || expectedStage}阶段，采购/裁剪阶段请使用订单二维码` };
  }
  if (parsedCode.type === 'json' || parsedCode.type === 'url') {
    return { valid: true, reason: '' };
  }
  return { valid: false, reason: '无法识别的码类型，请确认扫码内容' };
}

function getNextStage(currentStage) {
  const idx = PRODUCTION_STAGES.indexOf(currentStage);
  if (idx === -1) return null;
  if (idx >= PRODUCTION_STAGES.length - 1) return null;
  return PRODUCTION_STAGES[idx + 1];
}

function determineAutoFlow(scanResult) {
  if (!scanResult) return null;
  const stage = scanResult.progressStage || scanResult.stage || scanResult.scanType;
  const normalized = normalizeScanType(stage);
  const nextStage = getNextStage(normalized);
  const stageLabel = STAGE_LABELS[normalized] || normalized;
  const nextLabel = nextStage ? (STAGE_LABELS[nextStage] || nextStage) : null;
  if (scanResult.scanResult === 'success' || scanResult.success) {
    if (nextStage) {
      return {
        currentStage: normalized,
        currentLabel: stageLabel,
        nextStage,
        nextLabel,
        message: `${stageLabel}完成，下一工序：${nextLabel}`,
        autoNavigate: true,
      };
    }
    return {
      currentStage: normalized,
      currentLabel: stageLabel,
      nextStage: null,
      nextLabel: null,
      message: `${stageLabel}完成，所有生产工序已结束`,
      autoNavigate: false,
    };
  }
  return null;
}

export {
  MATERIAL_TYPE_MAP, SCAN_TYPE_MAP, ORDER_STATUS_MAP,
  PRODUCTION_STAGES, STAGE_LABELS,
  normalizeScanType, scanTypeText, orderStatusText, canUndo,
  parseBundleCode, validateBundleForStage, getNextStage, determineAutoFlow,
};
