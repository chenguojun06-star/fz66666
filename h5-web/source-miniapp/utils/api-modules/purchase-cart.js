/**
 * 购物车模块 API（purchase-cart）
 * 包含购物车的增删改查、合并、拆分、预览、确认下单等功能
 */
const { ok } = require('./helpers');

const purchaseCart = {
  /**
   * 获取当前用户的购物车
   */
  getCart() {
    return ok('/api/production/purchase-cart', 'GET', {});
  },

  /**
   * 添加物料到购物车
   */
  addItem(payload) {
    return ok('/api/production/purchase-cart/items', 'POST', payload || {});
  },

  /**
   * 更新购物车物料
   */
  updateItem(itemId, payload) {
    return ok(`/api/production/purchase-cart/items/${encodeURIComponent(itemId)}`, 'PUT', payload || {});
  },

  /**
   * 删除购物车物料
   */
  removeItem(itemId) {
    return ok(`/api/production/purchase-cart/items/${encodeURIComponent(itemId)}`, 'DELETE', {});
  },

  /**
   * 获取合并建议
   */
  getMergeSuggestions() {
    return ok('/api/production/purchase-cart/merge-suggestions', 'GET', {});
  },

  /**
   * 合并物料
   */
  mergeItems(payload) {
    return ok('/api/production/purchase-cart/items/merge', 'POST', payload || {});
  },

  /**
   * 拆分物料
   */
  splitItem(payload) {
    return ok('/api/production/purchase-cart/items/split', 'POST', payload || {});
  },

  /**
   * 预览采购单
   */
  preview() {
    return ok('/api/production/purchase-cart/preview', 'POST', {});
  },

  /**
   * 确认下单
   */
  confirm(itemIds) {
    return ok('/api/production/purchase-cart/confirm', 'POST', itemIds || []);
  },
};

module.exports = purchaseCart;
