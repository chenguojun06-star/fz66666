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
    return ok('/api/production/factory-shipment/list-by-order', 'POST', { orderId: orderId });
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

module.exports = { employeeAdvance, factoryShipment, wagePayment };
