/**
 * 款式 & 仓库 & 库存 & 物料 API
 * style / warehouse / stock / material / materialRoll / orderManagement
 */
const { ok } = require('./helpers');

const style = {
  listStyles(params) {
    return ok('/api/style/info/list', 'GET', params || {});
  },
  getBomList(styleId) {
    return ok('/api/style/bom/list', 'GET', { styleId });
  },
  getInventory(styleId) {
    return ok('/api/warehouse/finished-inventory/list', 'GET', { styleId });
  },
  updateInventory(styleId, data) {
    return ok('/api/warehouse/finished-inventory/outbound', 'POST', data || {});
  },
  getQuotation(styleId) {
    return ok('/api/style/quotation', 'GET', { styleId });
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
  scanQuery(data) { return ok('/api/stock/sample/scan-query', 'POST', data); },
  inbound(data) { return ok('/api/stock/sample/inbound', 'POST', data); },
  loan(data) { return ok('/api/stock/sample/loan', 'POST', data); },
  returnSample(data) { return ok('/api/stock/sample/return', 'POST', data); },
};

module.exports = { style, warehouse, material, materialRoll, orderManagement, sampleStock };
