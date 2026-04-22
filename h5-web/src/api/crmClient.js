import { http } from '@/services/http';

const crmClient = {
  login: (data) => http.post('/api/crm-client/login', data),

  getDashboard: (customerId) => http.get(`/api/crm-client/dashboard/${encodeURIComponent(customerId)}`),

  getOrders: (customerId, params) => http.get(`/api/crm-client/orders/${encodeURIComponent(customerId)}`, { params }),

  getOrderDetail: (customerId, orderId) => http.get(`/api/crm-client/orders/${encodeURIComponent(customerId)}/${encodeURIComponent(orderId)}`),

  getPurchases: (customerId, params) => http.get(`/api/crm-client/purchases/${encodeURIComponent(customerId)}`, { params }),

  getPurchaseDetail: (customerId, purchaseId) => http.get(`/api/crm-client/purchases/${encodeURIComponent(customerId)}/${encodeURIComponent(purchaseId)}`),

  getReceivables: (customerId, params) => http.get(`/api/crm-client/receivables/${encodeURIComponent(customerId)}`, { params }),

  getReceivableDetail: (customerId, receivableId) => http.get(`/api/crm-client/receivables/${encodeURIComponent(customerId)}/${encodeURIComponent(receivableId)}`),

  getProfile: (customerId) => http.get(`/api/crm-client/profile/${encodeURIComponent(customerId)}`),
};

export default crmClient;
