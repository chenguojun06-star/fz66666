import { http } from '@/services/http';

export const runtimeApi = {
  publicTenantList() {
    return http.get('/api/system/tenant/public-list');
  },
  login(payload) {
    return http.post('/api/system/user/login', payload);
  },
  getMe() {
    return http.get('/api/system/user/me');
  },
  unreadCount() {
    return http.get('/api/production/notice/unread-count');
  },
  personalScanStats() {
    return http.get('/api/production/scan/personal-stats');
  },
  listOrderByOrderNo(orderNo) {
    return http.get('/api/production/order/list', { params: { orderNo } });
  },
  getProcessConfig(orderNo) {
    return http.get(`/api/production/scan/process-config/${encodeURIComponent(orderNo)}`);
  },
  listScans(params) {
    return http.get('/api/production/scan/list', { params });
  },
  executeScan(payload) {
    return http.post('/api/production/scan/execute', payload);
  },
};
