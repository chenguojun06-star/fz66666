/**
 * 退货模块 API（return）
 * 包含采购退货（PurchaseReturn）和销售退货（SalesReturn）两类
 * 后端端点：
 *   采购退货 /api/production/purchase-return/*
 *   销售退货 /api/crm/sales-return/*
 */
const { ok } = require('./helpers');

const purchaseReturn = {
  /** 创建采购退货单 */
  create(payload) {
    return ok('/api/production/purchase-return', 'POST', payload || {});
  },
  /** 审核采购退货单（参数：approved/reason） */
  approve(returnId, payload) {
    return ok(`/api/production/purchase-return/${encodeURIComponent(returnId)}/approve`, 'POST', payload || {});
  },
  /** 完成采购退货（更新库存+应付账款） */
  complete(returnId) {
    return ok(`/api/production/purchase-return/${encodeURIComponent(returnId)}/complete`, 'POST', {});
  },
  /** 查询采购退货单列表 */
  list(params) {
    return ok('/api/production/purchase-return/list', 'GET', params || {});
  },
  /** 查询采购退货单详情 */
  detail(returnId) {
    return ok(`/api/production/purchase-return/${encodeURIComponent(returnId)}`, 'GET', {});
  },
};

const salesReturn = {
  /** 创建销售退货单 */
  create(payload) {
    return ok('/api/crm/sales-return/create', 'POST', payload || {});
  },
  /** 查询销售退货单列表 */
  list(params) {
    return ok('/api/crm/sales-return/list', 'GET', params || {});
  },
  /** 查询销售退货单详情 */
  detail(id) {
    return ok(`/api/crm/sales-return/${encodeURIComponent(id)}`, 'GET', {});
  },
  /** 审核销售退货单 */
  approve(id, payload) {
    return ok(`/api/crm/sales-return/${encodeURIComponent(id)}/approve`, 'POST', payload || {});
  },
  /** 拒绝销售退货单 */
  reject(id, reason) {
    return ok(`/api/crm/sales-return/${encodeURIComponent(id)}/reject?reason=${encodeURIComponent(reason || '')}`, 'POST', {});
  },
  /** 标记退款完成 */
  markRefunded(id) {
    return ok(`/api/crm/sales-return/${encodeURIComponent(id)}/refund`, 'POST', {});
  },
};

module.exports = { purchaseReturn, salesReturn };
