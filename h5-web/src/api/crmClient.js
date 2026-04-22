import { http } from '@/services/http';

const crmClient = {
  login: (data) => http.post('/api/crm-client/login', data),

  getDashboard: () => http.get('/api/crm-client/dashboard'),

  getOrders: (params) => http.get('/api/crm-client/orders', { params }),

  getOrderDetail: (orderId) => http.get(`/api/crm-client/orders/${encodeURIComponent(orderId)}`),

  getPurchases: (params) => http.get('/api/crm-client/purchases', { params }),

  getPurchaseDetail: (purchaseId) => http.get(`/api/crm-client/purchases/${encodeURIComponent(purchaseId)}`),

  getReceivables: (params) => http.get('/api/crm-client/receivables', { params }),

  getReceivableDetail: (receivableId) => http.get(`/api/crm-client/receivables/${encodeURIComponent(receivableId)}`),

  getProfile: () => http.get('/api/crm-client/profile'),
};

export default crmClient;
