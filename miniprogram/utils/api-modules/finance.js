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
  cancelPayment: function (id) {
    return ok('/api/finance/wage-payments/' + encodeURIComponent(id) + '/cancel', 'POST', {});
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

const payrollSettlement = {
  operatorSummary: function (params) {
    return ok('/api/finance/payroll-settlement/operator-summary', 'POST', params || {});
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

module.exports = { employeeAdvance, wagePayment, payrollSettlement, wageSettlementFeedback };
