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
  return SCAN_TYPE_MAP[v] || v;
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

export { MATERIAL_TYPE_MAP, SCAN_TYPE_MAP, ORDER_STATUS_MAP, normalizeScanType, scanTypeText, orderStatusText, canUndo };
