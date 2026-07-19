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

  // 阶段操作（完成/重置）
  stageAction(styleId, stage, action, remark) {
    const id = String(styleId || '').trim();
    const payload = remark ? { reason: remark } : {};
    return ok(`/api/style/info/${encodeURIComponent(id)}/stage-action?stage=${encodeURIComponent(stage)}&action=${encodeURIComponent(action)}`, 'POST', payload);
  },

  // 样衣审核（提交审核结论）
  saveSampleReview(styleId, payload) {
    const id = String(styleId || '').trim();
    return ok(`/api/style/info/${encodeURIComponent(id)}/sample-review`, 'POST', payload || {});
  },

  // BOM清单
  listBom(params) {
    return ok('/api/style/bom/list', 'GET', params || {});
  },
  createBom(payload) {
    return ok('/api/style/bom', 'POST', payload || {});
  },
  deleteBom(bomId) {
    const id = String(bomId || '').trim();
    return ok(`/api/style/bom/${encodeURIComponent(id)}`, 'DELETE', {});
  },

  // SKU 库存查询/调整
  getInventory(skuCode) {
    const code = String(skuCode || '').trim();
    return ok(`/api/style/sku/inventory/${encodeURIComponent(code)}`, 'GET', {});
  },
  updateInventory(data) {
    return ok('/api/style/sku/inventory/update', 'POST', data || {});
  },

  // 工序
  listProcesses(params) {
    return ok('/api/style/process/list', 'GET', params || {});
  },
  createProcess(payload) {
    return ok('/api/style/process', 'POST', payload || {});
  },
  deleteProcess(processId) {
    const id = String(processId || '').trim();
    return ok(`/api/style/process/${encodeURIComponent(id)}`, 'DELETE', {});
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
    const id = String(styleId || '').trim();
    return ok(`/api/pattern-revision/by-style/${encodeURIComponent(id)}`, 'GET', {});
  },
  savePatternRevision(styleId, payload) {
    const data = { ...(payload || {}), styleId: String(styleId || '').trim() };
    return ok('/api/pattern-revision', 'POST', data);
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
    return ok('/api/style/attachment/upload', 'POST', payload || {});
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
  getLocationItems(params) {
    return ok('/api/warehouse/location/items', 'GET', params || {});
  },
  listFinishedInventory(params) {
    return ok('/api/warehouse/finished-inventory/list', 'GET', params || {});
  },
  outboundFinishedInventory(data) {
    return ok('/api/warehouse/finished-inventory/outbound', 'POST', data || {});
  },
  // 别名：兼容历史调用 api.warehouse.outbound（避免运行时 TypeError）
  outbound(data) {
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
    // 与 PC 端 warehouseAreaApi.listByType 对齐：POST /api/warehouse/area/search
    return ok('/api/warehouse/area/search', 'POST', { warehouseType: warehouseType || '' });
  },
  listLocations(warehouseType, areaId) {
    // 与 PC 端 warehouseLocationMapApi 对齐：POST /api/warehouse/location/search
    return ok('/api/warehouse/location/search', 'POST', { warehouseType: warehouseType || '', areaId: areaId });
  },
};


const material = {
  listStockAlerts(params) {
    return ok('/api/production/material/stock/alerts', 'GET', params || {});
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
  listDatabase(params) {
    return ok('/api/material/database/list', 'GET', params || {});
  },
  getDatabaseById(id) {
    return ok(`/api/material/database/${encodeURIComponent(id)}`, 'GET', {});
  },
  generateMaterialCode(materialType) {
    return ok('/api/material/database/generate-code', 'GET', { materialType: materialType || 'accessory' });
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

// 样衣库存
const sampleStock = {
  list(params) { return ok('/api/stock/sample/list', 'GET', params || {}); },
  scanQuery(data) { return ok('/api/stock/sample/scan-query', 'POST', data); },
  inbound(data) { return ok('/api/stock/sample/inbound', 'POST', data); },
  loan(data) { return ok('/api/stock/sample/loan', 'POST', data); },
  returnSample(data) { return ok('/api/stock/sample/return', 'POST', data); },
};

const templateLibrary = {
  list(params) {
    return ok('/api/template-library/list', 'GET', params || {});
  },
  detail(id) {
    return ok(`/api/template-library/${encodeURIComponent(id)}`, 'GET', {});
  },
  processUnitPrices(styleNo) {
    return ok('/api/template-library/process-unit-prices', 'GET', { styleNo });
  },
  progressNodeUnitPrices(styleNo) {
    return ok('/api/template-library/progress-node-unit-prices', 'GET', { styleNo });
  },
  processPriceTemplate(styleNo) {
    return ok('/api/template-library/process-price-template', 'GET', { styleNo: styleNo || '' });
  },
  processPriceStyleOptions(keyword) {
    return ok('/api/template-library/process-price-style-options', 'GET', { keyword: keyword || '' });
  },
  saveProcessPriceTemplate(data) {
    return ok('/api/template-library/process-price-template', 'POST', data || {});
  },
  create(data) {
    return ok('/api/template-library', 'POST', data || {});
  },
  update(data) {
    return ok('/api/template-library', 'PUT', data || {});
  },
  remove(id) {
    return ok(`/api/template-library/${encodeURIComponent(id)}`, 'DELETE', {});
  },
};

module.exports = { style, warehouse, material, materialRoll, sampleStock, templateLibrary };
