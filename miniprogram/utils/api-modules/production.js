/**
 * 生产模块 API（production）
 * 包含订单、扫码、入库、采购、裁剪、样板、质检等 40+ 方法
 */
const { ok } = require('./helpers');

const production = {
  listOrders(params) {
    return ok('/api/production/order/list', 'GET', params || {});
  },
  createOrder(payload) {
    return ok('/api/production/order', 'POST', payload || {});
  },
  createOutstock(payload) {
    return ok('/api/production/outstock', 'POST', payload || {});
  },
  orderDetail(idOrOrderNo) {
    const value = String(idOrOrderNo || '').trim();
    const uuidPattern =
      /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (uuidPattern.test(value)) {
      return ok(`/api/production/order/detail/${encodeURIComponent(value)}`, 'GET', {});
    }
    return ok('/api/production/order/list', 'GET', { orderNo: value });
  },
  orderDetailByOrderNo(orderNo) {
    const on = String(orderNo || '').trim();
    return ok('/api/production/order/list', 'GET', { orderNo: on });
  },
  updateProgress(payload) {
    return ok('/api/production/order/update-progress', 'POST', payload || {});
  },
  quickEditOrder(payload) {
    return ok('/api/production/order/quick-edit', 'PUT', payload || {});
  },
  listWarehousing(params) {
    return ok('/api/production/warehousing/list', 'GET', params || {});
  },
  saveWarehousing(payload) {
    return ok('/api/production/warehousing', 'POST', payload || {});
  },
  listScans(params) {
    return ok('/api/production/scan/list', 'GET', params || {});
  },
  myScanHistory(params) {
    return ok('/api/production/scan/list', 'GET', { currentUser: 'true', ...(params || {}) });
  },
  myPatternScanHistory(params) {
    return ok('/api/production/pattern/scan-records/my-history', 'GET', params || {});
  },
  personalScanStats(params) {
    return ok('/api/production/scan/personal-stats', 'GET', params || {});
  },
  executeScan(payload) {
    return ok('/api/production/scan/execute', 'POST', payload || {});
  },
  undoScan(payload) {
    return ok('/api/production/scan/undo', 'POST', payload || {});
  },
  rescan(payload) {
    return ok('/api/production/scan/rescan', 'POST', payload || {});
  },
  getProcessConfig(orderNo) {
    return ok(`/api/production/scan/process-config/${encodeURIComponent(orderNo)}`, 'GET', {});
  },
  rollbackByBundle(payload) {
    return ok('/api/production/warehousing/rollback-by-bundle', 'POST', payload || {});
  },
  receivePurchase(payload) {
    return ok('/api/production/purchase/receive', 'POST', payload || {});
  },
  createPurchaseInstruction(payload) {
    return ok('/api/production/purchase/instruction', 'POST', payload || {});
  },
  updateArrivedQuantity(payload) {
    return ok('/api/production/purchase/update-arrived-quantity', 'POST', payload || {});
  },
  getMaterialPurchases(params) {
    const payload = { ...(params || {}) };
    if (payload.orderNo && !payload.scanCode) {
      payload.scanCode = payload.orderNo;
    }
    return ok('/api/production/purchase/list', 'GET', payload);
  },
  myProcurementTasks() {
    return ok('/api/production/purchase/list', 'GET', { myTasks: 'true' });
  },
  confirmReturnPurchase(payload) {
    return ok('/api/production/purchase/return-confirm', 'POST', payload || {});
  },
  resetReturnConfirm(payload) {
    return ok('/api/production/purchase/return-confirm/reset', 'POST', payload || {});
  },
  confirmProcurementComplete(payload) {
    return ok('/api/production/order/confirm-procurement', 'POST', payload || {});
  },
  myCuttingTasks() {
    return ok('/api/production/cutting-task/list', 'GET', { myTasks: 'true' });
  },
  myQualityTasks() {
    return ok('/api/production/scan/my-quality-tasks', 'GET', {});
  },
  myRepairTasks() {
    return ok('/api/production/warehousing/pending-repair-tasks', 'GET', {});
  },
  getCuttingBundle(orderNo, bundleNo) {
    return ok('/api/production/cutting/list', 'GET', { orderNo, bundleNo });
  },
  generateCuttingBundles(orderId, bundles) {
    return ok('/api/production/cutting/generate', 'POST', { orderId, bundles });
  },
  receiveCuttingTaskById(taskId, receiverId, receiverName) {
    return ok('/api/production/cutting-task/receive', 'POST', { taskId, receiverId, receiverName });
  },
  getCuttingTaskByOrderId(orderIdOrNo) {
    return ok('/api/production/cutting-task/list', 'GET', { orderNo: orderIdOrNo, pageSize: 1 });
  },
  listBundles(orderNo, page = 1, pageSize = 100) {
    return ok('/api/production/cutting/list', 'GET', { orderNo, page, pageSize });
  },
  getBundleByCode(qrCode) {
    return ok(`/api/production/cutting/by-code/${encodeURIComponent(qrCode)}`, 'GET', {});
  },
  splitTransfer(data) {
    return ok('/api/production/cutting/split-transfer', 'POST', data);
  },
  splitRollback(data) {
    return ok('/api/production/cutting/split-rollback', 'POST', data);
  },
  getBundleFamily(bundleId) {
    return ok(`/api/production/cutting/family/${bundleId}`, 'GET', {});
  },
  getPatternDetail(patternId) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}`, 'GET', {});
  },
  getPatternProcessConfig(patternId) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/process-config`, 'GET', {});
  },
  getPatternScanRecords(patternId) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/scan-records`, 'GET', {});
  },
  submitPatternScan(payload) {
    return ok('/api/production/pattern/scan', 'POST', payload || {});
  },
  reviewPattern(patternId, result, remark) {
    const id = String(patternId || '').trim();
    const action = encodeURIComponent('review');
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=${action}`, 'POST', {
      result,
      remark,
    });
  },
  receivePattern(patternId, remark) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=receive`, 'POST', {
      remark: remark || '',
    });
  },
  warehouseIn(patternId, warehouseCode, remark) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=warehouse-in`, 'POST', {
      warehouseCode: warehouseCode || '',
      remark: remark || '',
    });
  },
  getQualityAiSuggestion(orderId) {
    return ok(`/api/quality/ai-suggestion?orderId=${encodeURIComponent(orderId)}`, 'GET', {});
  },

  /* -------- 工序单价调整 -------- */
  queryOrderProcesses(orderNo) {
    return ok(`/api/production/process-price/processes?orderNo=${encodeURIComponent(orderNo)}`, 'GET', {});
  },
  adjustProcessPrice(payload) {
    return ok('/api/production/process-price/adjust', 'POST', payload);
  },
  priceAdjustHistory(orderNo) {
    return ok(`/api/production/process-price/history?orderNo=${encodeURIComponent(orderNo)}`, 'GET', {});
  },
};

module.exports = production;
