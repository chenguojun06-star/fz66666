/**
 * 生产模块 API（production）
 * 包含订单、扫码、入库、采购、裁剪、样板、质检等 40+ 方法
 */
const { ok } = require('./helpers');

/**
 * 规范化 patternId：从 JSON / URL参数 / 前缀格式中提取纯 id
 * 最后一道防线：无论调用方传什么，都确保 URL 拼接的是纯 id
 * 修复 P0：JSON 二维码被整体当作 id 传入导致后端 400
 */
function _normalizePatternId(patternId) {
  if (!patternId) return '';
  const s = String(patternId).trim();
  if (!s) return '';
  if (s.charAt(0) === '{') {
    try {
      const obj = JSON.parse(s);
      const id = obj.id || obj.patternId || obj.patternProductionId || obj.orderId;
      if (id) return String(id).trim();
    } catch (_e) { /* 解析失败继续 */ }
  }
  const m = s.match(/[?&]patternId=([^&]+)/);
  if (m && m[1]) {
    try { return decodeURIComponent(m[1]).trim(); } catch (_e) { return String(m[1]).trim(); }
  }
  const prefixMatch = s.match(/^pattern[-:_#](.+)/i);
  if (prefixMatch && prefixMatch[1]) return String(prefixMatch[1]).trim();
  return s;
}

const production = {
  listOrders(params) {
    return ok('/api/production/order/list', 'GET', params || {});
  },
  orderStats(params) {
    return ok('/api/production/order/stats', 'GET', params || {});
  },
  getFactoryCapacity() {
    return ok('/api/production/order/factory-capacity', 'GET', {});
  },
  getExternalFactoryStats() {
    return ok('/api/production/order/external-factory-stats', 'GET', {});
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
  /** 获取订单完整流程数据（含工序阶段/扫码记录/物料采购/BOM等） */
  getOrderFlow(orderId) {
    return ok(`/api/production/order/flow/${encodeURIComponent(orderId)}`, 'GET', {});
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
  warehousingStats(params) {
    return ok('/api/production/warehousing/stats', 'GET', params || {});
  },
  pendingBundles(status, orderId) {
    var params = { status: status };
    if (orderId) params.orderId = orderId;
    return ok('/api/production/warehousing/pending-bundles', 'GET', params);
  },
  /**
   * 质检简报（与 PC 端 InspectionDetail.fetchBriefing 一致）
   * 返回订单信息、款式信息、BOM、质检注意事项
   */
  qualityBriefing(orderId) {
    const id = String(orderId || '').trim();
    return ok(`/api/production/warehousing/quality-briefing/${encodeURIComponent(id)}`, 'GET', {});
  },
  /**
   * 菲号扫码就绪状态（与 PC 端 getBundleReadiness 一致）
   * 返回 qcReadyQrs / warehouseReadyQrs
   */
  bundleReadiness(orderId) {
    const id = String(orderId || '').trim();
    return ok(`/api/production/warehousing/bundle-readiness?orderId=${encodeURIComponent(id)}`, 'GET', {});
  },
  saveWarehousing(payload) {
    return ok('/api/production/warehousing', 'POST', payload || {});
  },
  /**
   * 更新质检入库记录（与 PC 端 handleWarehouseSubmit 对齐）
   * 用于详情页内直接入库：PUT /api/production/warehousing
   * body: { id, warehouse, warehouseAreaId }
   */
  updateWarehousing(payload) {
    return ok('/api/production/warehousing', 'PUT', payload || {});
  },
  /**
   * 批量合格质检（与 PC 端 handleBatchQualifiedSubmit 对齐）
   * POST /api/production/warehousing/batch
   */
  batchSaveWarehousing(payload) {
    return ok('/api/production/warehousing/batch', 'POST', payload || {});
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
  /**
   * 确认采购完成（单条，与 PC 端 useSampleProcurementQuickActions 一致）
   * 后端：POST /api/production/purchase/confirm-complete
   */
  confirmPurchaseComplete(payload) {
    return ok('/api/production/purchase/confirm-complete', 'POST', payload || {});
  },
  createPurchaseInstruction(payload) {
    return ok('/api/production/purchase/instruction', 'POST', payload || {});
  },
  updateArrivedQuantity(payload) {
    return ok('/api/production/purchase/update-arrived-quantity', 'POST', payload || {});
  },
  // P0 修复（D-023 2026-07-09）：去掉 orderNo→scanCode 转换。
  //   旧版触发后端 getByScanCode 分支，绕过多租户隔离 + 字段 enrichment。
  //   统一传 orderNo，与 PC 端 usePurchaseList 走相同后端路径（listWithEnrichment）。
  //   兜底传 pageSize=500，避免分页默认 10 条导致物料被截断显示不全。
  getMaterialPurchases(params) {
    const payload = { ...(params || {}), pageSize: 500 };
    return ok('/api/production/purchase/list', 'GET', payload);
  },
  // 采购数量编辑（样衣采购节点内联编辑）
  quickEditPurchase(payload) {
    return ok('/api/production/purchase/quick-edit', 'PUT', payload || {});
  },
  // 库存匹配查询（按物料编码查仓库可用库存）
  checkMaterialStock(materialCodes) {
    return ok('/api/production/purchase/stock-check', 'GET', { materialCodes });
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
    // P0 修复：后端 CuttingTaskController @GetMapping 无路径（根路径），原前端误加 /list
    return ok('/api/production/cutting-task', 'GET', { myTasks: 'true' });
  },
  myQualityTasks() {
    return ok('/api/production/scan/my-quality-tasks', 'GET', {});
  },
  myRepairTasks() {
    return ok('/api/production/warehousing/pending-repair-tasks', 'GET', {});
  },
  startBundleRepair(bundleId, operatorName) {
    return ok('/api/production/warehousing/mark-bundle-repairing', 'POST', { bundleId: bundleId, operatorName: operatorName || '' });
  },
  completeBundleRepair(bundleId) {
    return ok('/api/production/warehousing/mark-bundle-repaired', 'POST', { bundleId: bundleId });
  },
  scrapBundle(bundleId) {
    return ok('/api/production/warehousing/scrap-bundle', 'POST', { bundleId: bundleId });
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
    // P0 修复：后端 @GetMapping 无路径（根路径），原前端误加 /list
    return ok('/api/production/cutting-task', 'GET', { orderNo: orderIdOrNo, pageSize: 1 });
  },
  listBundles(orderNo, page = 1, pageSize = 100) {
    return ok('/api/production/cutting/list', 'GET', { orderNo, page, pageSize });
  },
  getBundleByCode(qrCode) {
    return ok('/api/production/cutting/by-code', 'POST', { qrCode });
  },
  splitTransfer(data) {
    return ok('/api/production/cutting/split-transfer', 'POST', data);
  },

  requestSplit(body) {
    return ok('/api/production/cutting/split-transfer/request', 'POST', body);
  },

  confirmSplit(splitLogId) {
    return ok('/api/production/cutting/split-transfer/confirm', 'POST', { splitLogId });
  },

  listPendingSplits() {
    return ok('/api/production/cutting/split-transfer/pending-for-me', 'GET', {});
  },

  /* -------- 转单（order-level transfer） -------- */
  transferSearchFactories(keyword, page, pageSize) {
    return ok('/api/production/order/transfer/search-factories', 'GET', { keyword: keyword || '', page: page || 1, pageSize: pageSize || 20 });
  },
  transferSearchUsers(keyword, page, pageSize) {
    return ok('/api/production/order/transfer/search-users', 'GET', { keyword: keyword || '', page: page || 1, pageSize: pageSize || 20 });
  },
  transferCreate(data) {
    return ok('/api/production/order/transfer/create', 'POST', data);
  },
  transferCreateToFactory(data) {
    return ok('/api/production/order/transfer/create-to-factory', 'POST', data);
  },

  getBundleFamily(bundleId) {
    return ok(`/api/production/cutting/family/${bundleId}`, 'GET', {});
  },
  getPatternDetail(patternId) {
    const id = _normalizePatternId(patternId);
    return ok(`/api/production/pattern/${encodeURIComponent(id)}`, 'GET', {});
  },
  listPatterns(params) {
    return ok('/api/production/pattern/list', 'GET', params || {});
  },
  /**
   * 样衣开发统计（与 PC 端 StyleInfoList activeStyles 逻辑一致）
   * 返回 { activeCount, completedCount, overdueCount, warningCount }
   */
  getSampleStats() {
    return ok('/api/production/pattern/sample-stats', 'GET', {});
  },
  getPatternProcessConfig(patternId) {
    const id = _normalizePatternId(patternId);
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/process-config`, 'GET', {});
  },
  getPatternLinkedOrder(patternId) {
    const id = _normalizePatternId(patternId);
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/linked-order`, 'GET', {});
  },
  getPatternScanRecords(patternId) {
    const id = _normalizePatternId(patternId);
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/scan-records`, 'GET', {});
  },
  /**
   * 撤销样衣扫码记录（与 PC 端 useSampleScanRecords.undoScanRecord 一致）
   * 后端：DELETE /api/production/pattern/{patternId}/scan-records/{scanRecordId}
   * 30 分钟内可撤销（前端校验，后端也会校验）
   */
  undoPatternScanRecord(patternId, scanRecordId) {
    const pid = _normalizePatternId(patternId);
    const sid = String(scanRecordId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(pid)}/scan-records/${encodeURIComponent(sid)}`, 'DELETE', {});
  },
  submitPatternScan(payload) {
    return ok('/api/production/pattern/scan', 'POST', payload || {});
  },
  reviewPattern(patternId, result, remark, images) {
    const id = _normalizePatternId(patternId);
    const action = encodeURIComponent('review');
    const payload = { result, remark };
    if (images && Array.isArray(images) && images.length > 0) {
      payload.images = images;
    }
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=${action}`, 'POST', payload);
  },
  /**
   * 保存样衣阶段进度（与 PC 端 useSampleStage.handleSaveSampleProgress 一致）
   * progress: { procurement, cutting, secondary, sewing, tail, warehousing }
   */
  savePatternProgress(patternId, progress) {
    const id = _normalizePatternId(patternId);
    const payload = {
      procurement: Number(progress?.procurement || 0),
      cutting: Number(progress?.cutting || 0),
      secondary: Number(progress?.secondary || 0),
      sewing: Number(progress?.sewing || 0),
      tail: Number(progress?.tail || 0),
      warehousing: Number(progress?.warehousing || 0),
    };
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/progress`, 'POST', payload);
  },

  /**
   * 通用样衣工作流操作（与 PC 端 useSampleStage 一致）
   * action: receive / complete / warehouse-in / review
   */
  patternWorkflowAction(patternId, action, payload) {
    const id = _normalizePatternId(patternId);
    const act = encodeURIComponent(action || '');
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=${act}`, 'POST', payload || {});
  },
  receivePattern(patternId, remark, extra) {
    const id = _normalizePatternId(patternId);
    const payload = { remark: remark || '' };
    if (extra) {
      if (extra.color) payload.color = extra.color;
      if (extra.quantity) payload.quantity = extra.quantity;
    }
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=receive`, 'POST', payload);
  },
  completePatternByTask(patternId) {
    const id = _normalizePatternId(patternId);
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/complete`, 'POST', {});
  },
  warehouseIn(patternId, warehouseCode, warehouseAreaId, warehouseLocationCode, remark) {
    const id = _normalizePatternId(patternId);
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/workflow-action?action=warehouse-in`, 'POST', {
      warehouseCode: warehouseCode || '',
      warehouseAreaId: warehouseAreaId || '',
      warehouseLocationCode: warehouseLocationCode || '',
      remark: remark || '',
    });
  },
  getQualityAiSuggestion(orderId) {
    return ok(`/api/quality/ai-suggestion?orderId=${encodeURIComponent(orderId)}`, 'GET', {});
  },
  analyzeQualityImage(payload) {
    return ok('/api/quality/ai-defect-detect', 'POST', payload || {});
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

  getProcessStatus(orderId) {
    return ok('/api/production/order/process-status/' + encodeURIComponent(orderId), 'GET', {});
  },
  getOrderTracking(orderId) {
    return ok('/api/production/process-tracking/order/' + encodeURIComponent(orderId), 'GET', {});
  },
  getNodeOperations(orderId) {
    return ok('/api/production/order/node-operations/' + encodeURIComponent(orderId), 'GET', {});
  },
  saveNodeOperations(payload) {
    return ok('/api/production/order/node-operations', 'POST', payload || {});
  },
  delegateProcess(payload) {
    return ok('/api/production/order/delegate-process', 'POST', payload || {});
  },
  listStyleProcesses(styleId) {
    return ok('/api/style/process/list', 'GET', { styleId: styleId });
  },
  saveStyleProcess(payload) {
    return ok('/api/style/process', payload.id ? 'PUT' : 'POST', payload || {});
  },
  deleteStyleProcess(id) {
    return ok('/api/style/process/' + encodeURIComponent(id), 'DELETE', {});
  },
  listSizePrices(styleId) {
    return ok('/api/style/size-price/list', 'GET', { styleId: styleId });
  },
  batchSaveSizePrices(payload) {
    return ok('/api/style/size-price/batch-save', 'POST', payload || {});
  },
  /**
   * 获取生产制单（工艺单）完整数据，与 PC 端 StyleProductionTab 一致
   */
  getProductionSheet(styleId) {
    const id = String(styleId || '').trim();
    return ok('/api/data-center/production-sheet', 'GET', { styleId: id });
  },

  listOrderRemarks(targetType, targetNo) {
    return ok('/api/system/order-remark/list', 'POST', { targetType: targetType, targetNo: targetNo });
  },

  addOrderRemark(targetType, targetNo, content, authorRole, imageUrls) {
    const payload = { targetType: targetType, targetNo: targetNo, content: content };
    if (authorRole) payload.authorRole = authorRole;
    if (imageUrls) payload.imageUrls = imageUrls;
    return ok('/api/system/order-remark/add', 'POST', payload);
  },

  listOrderImages(orderNo) {
    return ok('/api/production/order-image/list', 'POST', { orderNo: orderNo });
  },

  addOrderImage(orderNo, imageUrl, thumbnailUrl) {
    const payload = { orderNo: orderNo, imageUrl: imageUrl };
    if (thumbnailUrl) payload.thumbnailUrl = thumbnailUrl;
    return ok('/api/production/order-image', 'POST', payload);
  },

  deleteOrderImage(imageId) {
    return ok('/api/production/order-image/' + imageId, 'DELETE', {});
  },

  listOrderImageSnapshots(orderNo) {
    return ok('/api/production/order-image/snapshots', 'POST', { orderNo: orderNo });
  },

  createCuttingTask(payload) {
    return ok('/api/production/cutting-task/custom/create', 'POST', payload || {});
  },
};

const factoryShipment = {
  list: function (params) {
    return ok('/api/production/factory-shipment/list', 'POST', params || {});
  },
  listByOrder: function (orderId) {
    return ok('/api/production/factory-shipment/search', 'POST', { orderId: orderId });
  },
  shippable: function (orderId) {
    return ok('/api/production/factory-shipment/shippable/' + encodeURIComponent(orderId), 'GET', {});
  },
  ship: function (data) {
    return ok('/api/production/factory-shipment/ship', 'POST', data || {});
  },
  receive: function (id, payload) {
    return ok('/api/production/factory-shipment/' + encodeURIComponent(id) + '/receive', 'POST', payload || {});
  },
  getDetails: function (id) {
    return ok('/api/production/factory-shipment/' + encodeURIComponent(id) + '/details', 'GET', {});
  },
  remove: function (id) {
    return ok('/api/production/factory-shipment/' + encodeURIComponent(id), 'DELETE', {});
  },
};

module.exports = { ...production, factoryShipment };
