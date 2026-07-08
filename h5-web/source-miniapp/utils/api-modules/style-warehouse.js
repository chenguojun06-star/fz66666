/**
 * 款式 & 仓库 & 库存 & 物料 API
 * style / warehouse / stock / material / materialRoll / orderManagement
 */
const { ok } = require('./helpers');

const style = {
  // 款式信息
  listStyles(params) {
    return ok('/api/style/info/list', 'GET', params || {});
  },
  getStyleDetail(styleId) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}`, 'GET', {});
  },
  createStyle(payload) {
    return ok('/api/style/info', 'POST', payload || {});
  },
  updateStyle(styleId, payload) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}`, 'PUT', payload || {});
  },
  deleteStyle(styleId) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}`, 'DELETE', {});
  },

  // 阶段操作（完成/重置）
  stageAction(styleId, stage, action, remark) {
    const id = String(styleId || '').trim();
    const payload = remark ? { reason: remark } : {};
    return ok(`/api/style/info/${encodeURIComponent(id)}/stage-action?stage=${encodeURIComponent(stage)}&action=${encodeURIComponent(action)}`, 'POST', payload);
  },

  // BOM清单
  listBom(params) {
    return ok('/api/style/bom/list', 'GET', params || {});
  },
  createBom(payload) {
    return ok('/api/style/bom', 'POST', payload || {});
  },
  /**
   * 更新 BOM（后端 PUT /api/style/bom，id 放在 payload body 中）
   * 更新 devUsageAmount 后会自动同步 pending 状态的样衣采购任务数量
   */
  updateBom(payload) {
    return ok('/api/style/bom', 'PUT', payload || {});
  },
  deleteBom(bomId) {
    const id = String(bomId || '').trim();
    return ok(`/api/style/bom/${encodeURIComponent(id)}`, 'DELETE', {});
  },
  batchSaveBom(payload) {
    return ok('/api/style/bom/batch-save', 'POST', payload || {});
  },
  /**
   * 基于 BOM 生成样衣采购单（与 PC 端 StyleBomTab.handleGeneratePurchase 一致）
   * 后端会遍历 BOM 列表，按 devUsageAmount(优先) 或 usageAmount × 数量 × (1+损耗率) 计算采购数量
   */
  generateSamplePurchase(payload) {
    return ok('/api/style/bom/generate-purchase', 'POST', payload || {});
  },

  // 工序
  listProcesses(params) {
    return ok('/api/style/process/list', 'GET', params || {});
  },
  createProcess(payload) {
    return ok('/api/style/process', 'POST', payload || {});
  },
  updateProcess(processId, payload) {
    const id = String(processId || '').trim();
    return ok(`/api/style/process/${encodeURIComponent(id)}`, 'PUT', payload || {});
  },
  deleteProcess(processId) {
    const id = String(processId || '').trim();
    return ok(`/api/style/process/${encodeURIComponent(id)}`, 'DELETE', {});
  },

  // 工序模板
  listProcessTemplates(params) {
    return ok('/api/style/process-template/list', 'GET', params || {});
  },
  getProcessTemplate(templateId) {
    const id = String(templateId || '').trim();
    return ok(`/api/style/process-template/${encodeURIComponent(id)}`, 'GET', {});
  },
  createProcessTemplate(payload) {
    return ok('/api/style/process-template', 'POST', payload || {});
  },
  updateProcessTemplate(templateId, payload) {
    const id = String(templateId || '').trim();
    return ok(`/api/style/process-template/${encodeURIComponent(id)}`, 'PUT', payload || {});
  },
  deleteProcessTemplate(templateId) {
    const id = String(templateId || '').trim();
    return ok(`/api/style/process-template/${encodeURIComponent(id)}`, 'DELETE', {});
  },

  // 二次工艺
  listSecondaryProcesses(params) {
    return ok('/api/style/secondary-process/list', 'GET', params || {});
  },
  getSecondaryProcess(processId) {
    const id = String(processId || '').trim();
    return ok(`/api/style/secondary-process/${encodeURIComponent(id)}`, 'GET', {});
  },
  createSecondaryProcess(payload) {
    return ok('/api/style/secondary-process', 'POST', payload || {});
  },
  updateSecondaryProcess(processId, payload) {
    const id = String(processId || '').trim();
    return ok(`/api/style/secondary-process/${encodeURIComponent(id)}`, 'PUT', payload || {});
  },
  deleteSecondaryProcess(processId) {
    const id = String(processId || '').trim();
    return ok(`/api/style/secondary-process/${encodeURIComponent(id)}`, 'DELETE', {});
  },
  approveSecondaryProcess(processId) {
    const id = String(processId || '').trim();
    return ok(`/api/style/secondary-process/${encodeURIComponent(id)}/approve`, 'POST', {});
  },

  // 纸样
  getPatternRevision(styleId) {
    // 通过款式详情获取styleNo，再查纸样列表取最新一条
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}`, 'GET', {}).then(detail => {
      const styleNo = detail?.styleNo || detail?.styleCode || '';
      if (!styleNo) return null;
      return ok('/api/pattern-revision/list', 'GET', { styleNo, pageSize: 1 }).then(pageData => {
        const records = pageData?.records || [];
        return records.length > 0 ? records[0] : null;
      });
    });
  },
  savePatternRevision(styleId, payload) {
    return ok('/api/pattern-revision', 'POST', payload || {});
  },
  lockPatternRevision(styleId) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}/pattern-revision/lock`, 'POST', {});
  },
  rollbackPatternRevision(styleId) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}/pattern-revision/rollback`, 'POST', {});
  },

  // 尺码
  listSizes(params) {
    return ok('/api/style/size/list', 'GET', params || {});
  },
  saveSizes(payload) {
    return ok('/api/style/size', 'POST', payload || {});
  },

  // 附件
  listAttachments(params) {
    return ok('/api/style/attachment/list', 'GET', params || {});
  },
  uploadAttachment(payload) {
    return ok('/api/style/attachment', 'POST', payload || {});
  },
  deleteAttachment(attachmentId) {
    const id = String(attachmentId || '').trim();
    return ok(`/api/style/attachment/${encodeURIComponent(id)}`, 'DELETE', {});
  },

  // SKU
  listSkus(params) {
    return ok('/api/style/sku/list', 'GET', params || {});
  },

  // 报价单
  getQuotation(styleId) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/quotation?styleId=${encodeURIComponent(id)}`, 'GET', {});
  },
};

const warehouse = {
  listFinishedInventory(params) {
    return ok('/api/warehouse/finished-inventory/list', 'GET', params || {});
  },
  outboundFinishedInventory(data) {
    return ok('/api/warehouse/finished-inventory/outbound', 'POST', data || {});
  },
  freeInbound(data) {
    return ok('/api/warehouse/finished-inventory/free-inbound', 'POST', data || {});
  },
  batchInbound(data) {
    return ok('/api/warehouse/finished-inventory/batch-inbound', 'POST', data || {});
  },
  scanInbound(data) {
    return ok('/api/warehouse/finished-inventory/scan-inbound', 'POST', data || {});
  },
  scanQuery(scanCode) {
    return ok('/api/warehouse/finished-inventory/scan-query', 'GET', { scanCode });
  },
  reverse(warehousingId, reason) {
    return ok('/api/warehouse/finished-inventory/reverse', 'POST', { warehousingId, reason });
  },
  edit(warehousingId, changes) {
    return ok('/api/warehouse/finished-inventory/edit', 'POST', { warehousingId, changes });
  },
  listWarehouseAreas(warehouseType) {
    return ok('/api/warehouse/area/list-by-type', 'GET', { warehouseType: warehouseType || '' });
  },
  listLocations(warehouseType, areaId) {
    return ok('/api/warehouse/location/list-by-type', 'GET', { warehouseType: warehouseType || '', areaId: areaId });
  },
  // 库位库存详情（库位扫码后查询）
  locationItems(locationCode) {
    return ok('/api/warehouse/location/items', 'GET', { locationCode });
  },
};


const material = {
  listStockAlerts(params) {
    return ok('/api/production/material/stock/alerts', 'GET', params || {});
  },
  listBatchDetails(params) {
    return ok('/api/production/material/stock/batch-details', 'GET', params || {});
  },
  listPurchaseRecords(params) {
    return ok('/api/production/purchase/list', 'GET', params || {});
  },
  freeInbound(data) {
    return ok('/api/production/material/stock/free-inbound', 'POST', data || {});
  },
  batchInbound(data) {
    return ok('/api/production/material/stock/batch-inbound', 'POST', data || {});
  },
  reverseInbound(inboundId, reason) {
    return ok('/api/production/material/stock/reverse', 'POST', { inboundId, reason });
  },
  editInbound(inboundId, changes) {
    return ok('/api/production/material/stock/edit', 'POST', { inboundId, changes });
  },
  scanQuery(materialCode) {
    return ok('/api/production/material/stock/scan-query', 'GET', { materialCode });
  },
};

const materialRoll = {
  scan(data) {
    return ok('/api/production/material/roll/scan', 'POST', data || {});
  },
  listByInbound(params) {
    return ok('/api/production/material/roll/list', 'POST', params || {});
  },
};

const orderManagement = {
  createFromStyle(data) {
    return ok('/api/production/order/create-from-style', 'POST', data || {});
  },
};

// 样衣库存
const sampleStock = {
  list(params) { return ok('/api/stock/sample/list', 'GET', params || {}); },
  scanQuery(data) { return ok('/api/stock/sample/scan-query', 'POST', data); },
  inbound(data) { return ok('/api/stock/sample/inbound', 'POST', data); },
  inboundBatch(data) { return ok('/api/stock/sample/inbound/batch', 'POST', data); },
  loan(data) { return ok('/api/stock/sample/loan', 'POST', data); },
  returnSample(data) { return ok('/api/stock/sample/return', 'POST', data); },
  transfer(data) { return ok('/api/stock/sample/transfer', 'POST', data); },
  destroy(data) { return ok('/api/stock/sample/destroy', 'POST', data); },
  transferToOutstock(data) { return ok('/api/stock/sample/transfer-to-outstock', 'POST', data); },
  loanList(params) { return ok('/api/stock/sample/loan/list', 'GET', params || {}); },
};

module.exports = { style, warehouse, material, materialRoll, orderManagement, sampleStock };
