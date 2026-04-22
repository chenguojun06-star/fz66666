import { http } from '@/services/http';

const supplierPortal = {
  login: (data) => http.post('/api/supplier-portal/login', data),
  getDashboard: () => http.get('/api/supplier-portal/dashboard'),
  getPurchases: (params) => http.get('/api/supplier-portal/purchases', { params }),
  getPurchaseDetail: (id) => http.get(`/api/supplier-portal/purchases/${encodeURIComponent(id)}`),
  updateShipment: (id, data) => http.post(`/api/supplier-portal/purchases/${encodeURIComponent(id)}/ship`, data),
  getInventory: (params) => http.get('/api/supplier-portal/inventory', { params }),
  getPayables: (params) => http.get('/api/supplier-portal/payables', { params }),
  getReconciliations: (params) => http.get('/api/supplier-portal/reconciliations', { params }),
  getProfile: () => http.get('/api/supplier-portal/profile'),
};

export default supplierPortal;
