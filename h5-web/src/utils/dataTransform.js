function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickNumber(data, keys) {
  if (!data || typeof data !== 'object') return 0;
  for (let i = 0; i < keys.length; i++) {
    if (data[keys[i]] !== null && data[keys[i]] !== undefined) return toNumber(data[keys[i]]);
  }
  return 0;
}

function normalizeStats(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const productionCount = pickNumber(data, ['productionCount', 'production_count', 'productionOrderCount', 'orderCount']);
  const warehousingOrderCount = pickNumber(data, ['warehousingOrderCount', 'warehousing_order_count', 'todayWarehousingCount']);
  const unqualifiedQuantity = pickNumber(data, ['unqualifiedQuantity', 'unqualified_quantity', 'defectCount', 'badCount']);
  const materialPurchase = pickNumber(data, ['materialPurchase', 'material_purchase', 'purchaseCount', 'procurementCount']);
  return {
    styleCount: pickNumber(data, ['styleCount', 'style_count']),
    productionCount,
    productionOrders: productionCount,
    orderQuantityTotal: pickNumber(data, ['orderQuantityTotal', 'order_quantity_total', 'totalOrderQuantity']),
    pendingReconciliationCount: pickNumber(data, ['pendingReconciliationCount', 'pending_reconciliation_count']),
    paymentApprovalCount: pickNumber(data, ['paymentApprovalCount', 'payment_approval_count']),
    todayScanCount: pickNumber(data, ['todayScanCount', 'today_scan_count']),
    totalScanCount: pickNumber(data, ['totalScanCount', 'total_scan_count']),
    warehousingOrderCount,
    warehousingToday: warehousingOrderCount,
    totalWarehousingCount: pickNumber(data, ['totalWarehousingCount', 'total_warehousing_count']),
    unqualifiedQuantity,
    defectCount: unqualifiedQuantity,
    materialPurchase,
    urgentEventCount: pickNumber(data, ['urgentEventCount', 'urgent_event_count']),
  };
}

function normalizeOrder(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    id: data.id !== null ? String(data.id) : '',
    orderNo: data.orderNo || data.order_no || '',
    styleNo: data.styleNo || data.style_no || '',
    styleName: data.styleName || data.style_name || '',
    quantity: pickNumber(data, ['quantity', 'totalQuantity']),
    status: data.status || '',
    createTime: data.createTime || data.create_time || '',
  };
}

export { toNumber, pickNumber, normalizeStats, normalizeOrder };
