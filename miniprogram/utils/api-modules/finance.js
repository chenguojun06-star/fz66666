const { ok } = require('./helpers');

const employeeAdvance = {
  list: function (params) {
    return ok('/api/finance/employee-advance/list', 'POST', params || {});
  },
  create: function (data) {
    return ok('/api/finance/employee-advance', 'POST', data || {});
  },
  approve: function (id, remark) {
    return ok('/api/finance/employee-advance/' + encodeURIComponent(id) + '/stage-action?action=approve', 'POST', { remark: remark || '' });
  },
  reject: function (id, remark) {
    return ok('/api/finance/employee-advance/' + encodeURIComponent(id) + '/stage-action?action=reject', 'POST', { remark: remark || '' });
  },
  repay: function (id, amount) {
    return ok('/api/finance/employee-advance/' + encodeURIComponent(id) + '/stage-action?action=repay', 'POST', { amount: amount });
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

const wagePayment = {
  listPendingPayables: function (params) {
    return ok('/api/finance/wage-payments/pending-payables', 'POST', params || {});
  },
  listPayments: function (params) {
    return ok('/api/finance/wage-payments/list', 'POST', params || {});
  },
  initiatePayment: function (data) {
    return ok('/api/finance/wage-payments/initiate-with-callback', 'POST', data || {});
  },
  confirmOffline: function (id) {
    return ok('/api/finance/wage-payments/' + encodeURIComponent(id) + '/confirm-offline-with-callback', 'POST', {});
  },
  confirmReceived: function (id) {
    return ok('/api/finance/wage-payments/' + encodeURIComponent(id) + '/confirm-received', 'POST', {});
  },
  cancelPayment: function (id, data) {
    return ok('/api/finance/wage-payments/' + encodeURIComponent(id) + '/cancel', 'POST', data || {});
  },
  searchPayee: function (params) {
    return ok('/api/finance/payee-search', 'POST', params || {});
  },
  listAccounts: function (params) {
    return ok('/api/finance/payment-accounts/list', 'POST', params || {});
  },
  saveAccount: function (data) {
    return ok('/api/finance/payment-accounts', 'POST', data || {});
  },
  dashboardStats: function (startDate, endDate) {
    return ok('/api/finance/wage-payments/dashboard-stats?startDate=' + encodeURIComponent(startDate || '') + '&endDate=' + encodeURIComponent(endDate || ''), 'GET', {});
  },
};

/**
 * GET 参数拼 query string（后端 @RequestParam Map 用 GET / list 接口）
 * @param {Object} params - 查询参数
 * @returns {string} 形如 a=1&b=2（空对象返回 ''）
 */
function toQuery(params) {
  if (!params) return '';
  const parts = [];
  Object.keys(params).forEach(function (k) {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.join('&');
}

const payrollSettlement = {
  operatorSummary: function (params) {
    return ok('/api/finance/payroll-settlement/operator-summary', 'POST', params || {});
  },
  /**
   * 审核工资明细（PC 端 PayrollOperatorSummary 同源接口）
   * 后端限制：仅主管及以上；外部工厂订单需已关单
   * @param {string} approvalId - 明细审批标识
   * @returns {Promise} 成功返回 null
   */
  approveDetail: function (approvalId) {
    return ok('/api/finance/payroll-settlement/detail-approval/' + encodeURIComponent(approvalId) + '/approve', 'POST', {});
  },
};

/**
 * 物料对账（D-417 手机端独立处理页）
 * 后端：MaterialReconciliationController
 * 金额口径：单价 × 对账数量（对账数量封顶到货量），与「按实际到货算钱」一致
 */
const materialReconciliation = {
  list: function (params) {
    return ok('/api/finance/material-reconciliation/list?' + toQuery(params), 'GET', {});
  },
  getById: function (id) {
    return ok('/api/finance/material-reconciliation/' + encodeURIComponent(id), 'GET', {});
  },
  /**
   * 状态流转（审核 / 驳回 / 结算）
   * @param {string} id - 对账单 id
   * @param {string} action - 动作（approve/reject/settle 等，后端解析）
   * @param {string} [status] - 目标状态
   * @param {string} [reason] - 原因（驳回时填）
   * @returns {Promise}
   */
  statusAction: function (id, action, status, reason) {
    let qs = 'action=' + encodeURIComponent(action || '');
    if (status) qs += '&status=' + encodeURIComponent(status);
    if (reason) qs += '&reason=' + encodeURIComponent(reason);
    return ok('/api/finance/material-reconciliation/' + encodeURIComponent(id) + '/status-action?' + qs, 'POST', {});
  },
};

/**
 * 费用报销（D-417 手机端独立处理页）
 * 后端：ExpenseReimbursementController
 */
const expenseReimbursement = {
  list: function (params) {
    return ok('/api/finance/expense-reimbursement/list?' + toQuery(params), 'GET', {});
  },
  getById: function (id) {
    return ok('/api/finance/expense-reimbursement/' + encodeURIComponent(id), 'GET', {});
  },
  /**
   * 审批（批准/驳回）
   * @param {string} id - 报销单 id
   * @param {string} action - approve=批准, reject=驳回
   * @param {string} [remark] - 备注/驳回理由
   * @returns {Promise}
   */
  approve: function (id, action, remark) {
    let qs = 'action=' + encodeURIComponent(action || '');
    if (remark) qs += '&remark=' + encodeURIComponent(remark);
    return ok('/api/finance/expense-reimbursement/' + encodeURIComponent(id) + '/approve?' + qs, 'POST', {});
  },
  /**
   * 确认付款（审批通过后的打款动作）
   * @param {string} id - 报销单 id
   * @param {string} [remark] - 备注
   * @returns {Promise}
   */
  pay: function (id, remark) {
    let qs = remark ? '?remark=' + encodeURIComponent(remark) : '';
    return ok('/api/finance/expense-reimbursement/' + encodeURIComponent(id) + '/pay' + qs, 'POST', {});
  },
};

const wageSettlementFeedback = {
  myPaidSettlements: function (params) {
    return ok('/api/finance/wage-settlement-feedback/my-paid-settlements', 'POST', params || {});
  },
  submit: function (data) {
    return ok('/api/finance/wage-settlement-feedback/submit', 'POST', data || {});
  },
};

module.exports = {
  employeeAdvance,
  factoryShipment,
  wagePayment,
  payrollSettlement,
  wageSettlementFeedback,
  materialReconciliation,
  expenseReimbursement,
};
