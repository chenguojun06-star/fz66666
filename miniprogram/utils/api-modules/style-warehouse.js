/**
 * 款式 & 仓库 & 库存 & 物料 API
 * style / warehouse / stock / material / materialRoll / orderManagement
 */
const { ok } = require('./helpers');

const style = {
  listStyles(params) {
    return ok('/api/style-info/list', 'GET', params || {});
  },
  getBomList(styleId) {
    return ok(`/api/style-info/${styleId}/bom`, 'GET', {});
  },
  getInventory(styleId) {
    return ok(`/api/style-info/${styleId}/inventory`, 'GET', {});
  },
  updateInventory(styleId, data) {
    return ok(`/api/style-info/${styleId}/inventory`, 'PUT', data || {});
  },
};

const warehouse = {
  listFinishedInventory(params) {
    return ok('/api/warehouse/finished/inventory/list', 'GET', params || {});
  },
  outboundFinishedInventory(data) {
    return ok('/api/warehouse/finished/inventory/outbound', 'POST', data || {});
  },
};


const material = {
  listStockAlerts(params) {
    return ok('/api/material/stock/alerts', 'GET', params || {});
  },
  listBatchDetails(params) {
    return ok('/api/material/stock/batch-details', 'GET', params || {});
  },
  listPurchaseRecords(params) {
    return ok('/api/material/purchase/records', 'GET', params || {});
  },
};

const materialRoll = {
  scan(data) {
    return ok('/api/material/roll/scan', 'POST', data || {});
  },
  listByInbound(params) {
    return ok('/api/material/roll/list-by-inbound', 'GET', params || {});
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
