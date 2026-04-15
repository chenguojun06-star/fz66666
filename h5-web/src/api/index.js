import { http, handleUnauthorized } from '@/services/http';
import { useAuthStore } from '@/stores/authStore';

const production = {
  orderList: (params) => http.get('/api/production/order/list', { params }),
  createOrder: (payload) => http.post('/api/production/order', payload),
  createOutstock: (payload) => http.post('/api/production/outstock', payload),
  orderDetail: (idOrOrderNo) => {
    const value = String(idOrOrderNo || '').trim();
    const uuidPattern = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (uuidPattern.test(value)) {
      return http.get(`/api/production/order/detail/${encodeURIComponent(value)}`);
    }
    return http.get('/api/production/order/list', { params: { orderNo: value } });
  },
  orderDetailByOrderNo: (orderNo) => http.get('/api/production/order/list', { params: { orderNo: String(orderNo || '').trim() } }),
  updateProgress: (payload) => http.post('/api/production/order/update-progress', payload),
  quickEditOrder: (payload) => http.put('/api/production/order/quick-edit', payload),
  listWarehousing: (params) => http.get('/api/production/warehousing/list', { params }),
  saveWarehousing: (payload) => http.post('/api/production/warehousing', payload),
  listScans: (params) => http.get('/api/production/scan/list', { params }),
  myScanHistory: (params) => http.get('/api/production/scan/list', { params: { currentUser: 'true', ...(params || {}) } }),
  myPatternScanHistory: (params) => http.get('/api/production/pattern/scan-records/my-history', { params }),
  personalScanStats: (params) => http.get('/api/production/scan/personal-stats', { params }),
  executeScan: (payload) => http.post('/api/production/scan/execute', payload),
  undoScan: (payload) => http.post('/api/production/scan/undo', payload),
  rescan: (payload) => http.post('/api/production/scan/rescan', payload),
  getProcessConfig: (orderNo) => http.get(`/api/production/scan/process-config/${encodeURIComponent(orderNo)}`),
  rollbackByBundle: (payload) => http.post('/api/production/warehousing/rollback-by-bundle', payload),
  receivePurchase: (payload) => http.post('/api/production/purchase/receive', payload),
  createPurchaseInstruction: (payload) => http.post('/api/production/purchase/instruction', payload),
  updateArrivedQuantity: (payload) => http.post('/api/production/purchase/update-arrived-quantity', payload),
  getMaterialPurchases: (params) => {
    const payload = { ...(params || {}) };
    if (payload.orderNo && !payload.scanCode) {
      payload.scanCode = payload.orderNo;
    }
    return http.get('/api/production/purchase/list', { params: payload });
  },
  myProcurementTasks: () => http.get('/api/production/purchase/list', { params: { myTasks: 'true' } }),
  confirmReturnPurchase: (payload) => http.post('/api/production/purchase/return-confirm', payload),
  resetReturnConfirm: (payload) => http.post('/api/production/purchase/return-confirm/reset', payload),
  confirmProcurementComplete: (payload) => http.post('/api/production/order/confirm-procurement', payload),
  myCuttingTasks: () => http.get('/api/production/cutting-task/list', { params: { myTasks: 'true' } }),
  myQualityTasks: () => http.get('/api/production/scan/my-quality-tasks'),
  myRepairTasks: () => http.get('/api/production/warehousing/pending-repair-tasks'),
  receiveCuttingTaskById: (taskId, receiverId, receiverName) => http.post('/api/production/cutting-task/receive', { taskId, receiverId, receiverName }),
  getCuttingTaskByOrderId: (orderIdOrNo) => http.get('/api/production/cutting-task/list', { params: { orderNo: orderIdOrNo, pageSize: 1 } }),
  getCuttingBundle: (orderNo, bundleNo) => http.get('/api/production/cutting/list', { params: { orderNo, bundleNo } }),
  generateCuttingBundles: (orderId, bundles) => http.post('/api/production/cutting/generate', { orderId, bundles }),
  listBundles: (orderNo, page = 1, pageSize = 100) => http.get('/api/production/cutting/list', { params: { orderNo, page, pageSize } }),
  getBundleByCode: (qrCode) => http.get(`/api/production/cutting/by-code/${encodeURIComponent(qrCode)}`),
  splitTransfer: (data) => http.post('/api/production/cutting/split-transfer', data),
  splitRollback: (data) => http.post('/api/production/cutting/split-rollback', data),
  getBundleFamily: (bundleId) => http.get(`/api/production/cutting/family/${bundleId}`),
  getPatternDetail: (patternId) => http.get(`/api/production/pattern/${encodeURIComponent(String(patternId || '').trim())}`),
  getPatternProcessConfig: (patternId) => http.get(`/api/production/pattern/${encodeURIComponent(String(patternId || '').trim())}/process-config`),
  getPatternScanRecords: (patternId) => http.get(`/api/production/pattern/${encodeURIComponent(String(patternId || '').trim())}/scan-records`),
  submitPatternScan: (payload) => http.post('/api/production/pattern/scan', payload),
  receivePattern: (patternId, remark) => {
    const id = encodeURIComponent(String(patternId || '').trim());
    return http.post(`/api/production/pattern/${id}/workflow-action?action=receive`, { remark: remark || '' });
  },
  reviewPattern: (patternId, result, remark) => {
    const id = encodeURIComponent(String(patternId || '').trim());
    return http.post(`/api/production/pattern/${id}/workflow-action?action=review`, { result, remark });
  },
  warehouseIn: (patternId, warehouseCode, remark) => {
    const id = encodeURIComponent(String(patternId || '').trim());
    return http.post(`/api/production/pattern/${id}/workflow-action?action=warehouse-in`, { warehouseCode: warehouseCode || '', remark: remark || '' });
  },
  getQualityAiSuggestion: (orderId) => http.get('/api/quality/ai-suggestion', { params: { orderId } }),
  queryOrderProcesses: (orderNo) => http.get('/api/production/process-price/processes', { params: { orderNo } }),
  adjustProcessPrice: (payload) => http.post('/api/production/process-price/adjust', payload),
  priceAdjustHistory: (orderNo) => http.get('/api/production/process-price/history', { params: { orderNo } }),
};

const system = {
  login: (payload) => http.post('/api/system/user/login', payload, { headers: { skipAuth: true } }),
  getMe: () => http.get('/api/system/user/me'),
  listPendingUsers: () => http.get('/api/system/user/pending'),
  updateUser: (userId, data) => http.put(`/api/system/user/${userId}`, data),
  approveUser: (userId, data) => http.post(`/api/system/user/${userId}/approval-action?action=approve`, data || {}),
  rejectUser: (userId, data) => http.post(`/api/system/user/${userId}/approval-action?action=reject`, data || {}),
  listRoles: () => http.get('/api/system/role/list'),
  getOnlineCount: () => http.get('/api/system/user/online-count'),
  listOrganizationDepartments: () => http.get('/api/system/organization/departments'),
  changePassword: (data) => http.post('/api/system/user/me/change-password', data || {}),
  submitFeedback: (data) => http.post('/api/system/feedback/submit', data),
  myFeedbackList: (params) => http.post('/api/system/feedback/my-list', params || {}),
  getDictList: (type) => http.get('/api/system/dict/by-type', { params: { type } }),
};

const serial = {
  generate: (type) => http.get('/api/system/serial/generate', { params: { type } }),
};

const factory = {
  list: (params) => http.get('/api/system/factory/list', { params: params || {} }),
};

const factoryWorker = {
  list: (factoryId) => http.get('/api/factory-worker/list', { params: { factoryId } }),
  save: (data) => http.post('/api/factory-worker/save', data || {}),
  remove: (id) => http.delete(`/api/factory-worker/${id}`),
};

const tenant = {
  publicList: () => http.get('/api/system/tenant/public-list', { headers: { skipAuth: true } }),
  myTenant: () => http.get('/api/system/tenant/my'),
  workerRegister: (data) => http.post('/api/system/tenant/registration/register', data || {}, { headers: { skipAuth: true } }),
  listPendingRegistrations: () => http.post('/api/system/tenant/registrations/pending', {}),
  approveRegistration: (id, data) => http.post(`/api/system/tenant/registrations/${id}/approve`, data || {}),
  rejectRegistration: (id, data) => http.post(`/api/system/tenant/registrations/${id}/reject`, data || {}),
};

const intelligence = {
  precheckScan: (payload) => http.post('/api/intelligence/scan-advisor/precheck', payload || {}),
  getScanTips: (payload) => http.post('/api/intelligence/scan-advisor/tips', payload || {}),
  aiAdvisorChat: (params) => http.post('/api/intelligence/ai-advisor/chat', params),
  aiAdvisorChatStream: (params, onEvent, onComplete, onError) => {
    const token = useAuthStore.getState().token;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.webyszl.cn';
    const question = encodeURIComponent(params.question || '');
    const pageContext = params.pageContext ? encodeURIComponent(params.pageContext) : '';
    const conversationId = params.conversationId || '';
    const imageUrl = params.imageUrl || '';
    const orderNo = params.orderNo || '';
    const processName = params.processName ? encodeURIComponent(params.processName) : '';
    const stage = params.stage ? encodeURIComponent(params.stage) : '';
    let url = `${baseUrl}/api/intelligence/ai-advisor/chat/stream?question=${question}`;
    if (pageContext) url += `&pageContext=${pageContext}`;
    if (conversationId) url += `&conversationId=${encodeURIComponent(conversationId)}`;
    if (imageUrl) url += `&imageUrl=${encodeURIComponent(imageUrl)}`;
    if (orderNo) url += `&orderNo=${encodeURIComponent(orderNo)}`;
    if (processName) url += `&processName=${processName}`;
    if (stage) url += `&stage=${stage}`;

    const controller = new AbortController();
    fetch(url, {
      method: 'GET',
      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          handleUnauthorized();
          throw new Error('登录已过期');
        }
        if (!response.ok) {
          const err = new Error(`HTTP ${response.status}`);
          err.status = response.status;
          throw err;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventName = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:') && eventName) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                if (eventName === 'done') {
                  if (onComplete) onComplete();
                } else {
                  if (onEvent) onEvent({ type: eventName, data });
                }
              } catch (e) {
                if (onEvent) onEvent({ type: eventName, data: { content: line.slice(5).trim() } });
              }
              eventName = '';
            }
          }
        }
        if (onComplete) onComplete();
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && onError) onError(err);
      });
    return { abort: () => controller.abort() };
  },
  naturalLanguageExecute: (params) => http.post('/api/intelligence/crew/nl-execute', params),
  executeCommand: (payload) => http.post('/api/intelligence/execution-engine/execute', payload),
  getPendingCommands: () => http.get('/api/intelligence/execution-engine/pending'),
  approveCommand: (commandId) => http.post(`/api/intelligence/execution-engine/${commandId}/approve`),
  rejectCommand: (commandId) => http.post(`/api/intelligence/execution-engine/${commandId}/reject`),
  visualAnalyze: (payload) => http.post('/api/intelligence/visual/analyze', payload || {}),
  getAgentActivityList: () => http.get('/api/intelligence/agent-activity/agents'),
  getAgentAlerts: () => http.get('/api/intelligence/agent-activity/alerts'),
  getMyPendingTaskSummary: () => http.get('/api/intelligence/pending-tasks/summary'),
  voiceCommand: (payload) => http.post('/api/intelligence/voice/command', payload),
};

const notice = {
  list: (params) => http.get('/api/production/notice/my', { params }),
  unreadCount: () => http.get('/api/production/notice/unread-count'),
  markRead: (id) => http.post(`/api/production/notice/${id}/read`),
};

const dashboard = {
  get: (params) => http.get('/api/dashboard', { params: params || {} }),
  getTopStats: (params) => http.get('/api/dashboard/top-stats', { params: params || {} }),
};

const wechat = {
  generateInviteQr: (payload) => http.post('/api/wechat/mini-program/invite/generate', payload),
  inviteInfo: (token) => http.get(`/api/wechat/mini-program/invite/info?token=${encodeURIComponent(token)}`),
};

const common = {
  uploadImage: (filePath) => {
    const token = useAuthStore.getState().token;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.webyszl.cn';
    const formData = new FormData();
    if (filePath instanceof File) {
      formData.append('file', filePath);
    } else {
      return Promise.resolve(filePath);
    }
    return fetch(`${baseUrl}/api/common/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    }).then((r) => {
      if (r.status === 401) {
        handleUnauthorized();
        throw new Error('登录已过期');
      }
      return r.json();
    }).then((res) => {
      if (res.code === 200 && res.data) return res.data;
      return res.msg || res.data || '';
    });
  },
};

const style = {
  listStyles: (params) => http.get('/api/style/info/list', { params: params || {} }),
  getBomList: (styleId) => http.get('/api/style/bom/list', { params: { styleId } }),
  getInventory: (styleId) => http.get('/api/warehouse/finished-inventory/list', { params: { styleId } }),
  updateInventory: (styleId, data) => http.post('/api/warehouse/finished-inventory/outbound', data || {}),
};

const warehouse = {
  listFinishedInventory: (params) => http.get('/api/warehouse/finished-inventory/list', { params: params || {} }),
  outboundFinishedInventory: (data) => http.post('/api/warehouse/finished-inventory/outbound', data || {}),
};

const material = {
  listStockAlerts: (params) => http.get('/api/production/material/stock/alerts', { params: params || {} }),
  listBatchDetails: (params) => http.get('/api/production/material/stock/batch-details', { params: params || {} }),
  listPurchaseRecords: (params) => http.get('/api/production/purchase/list', { params: params || {} }),
};

const materialRoll = {
  scan: (data) => http.post('/api/production/material/roll/scan', data),
  listByInbound: (params) => http.get('/api/production/material/roll/list-by-inbound', { params: params || {} }),
};

const orderManagement = {
  createFromStyle: (data) => http.post('/api/production/order/create-from-style', data),
};

const sampleStock = {
  scanQuery: (data) => http.post('/api/stock/sample/scan-query', data),
  inbound: (data) => http.post('/api/stock/sample/inbound', data),
  loan: (data) => http.post('/api/stock/sample/loan', data),
  returnSample: (data) => http.post('/api/stock/sample/return', data),
};

const finance = {
  payrollSummary: (payload) => http.post('/api/finance/payroll-settlement/operator-summary', payload),
};

const api = {
  production,
  system,
  serial,
  factory,
  factoryWorker,
  tenant,
  intelligence,
  notice,
  dashboard,
  wechat,
  common,
  style,
  warehouse,
  material,
  materialRoll,
  orderManagement,
  sampleStock,
  finance,
};

export default api;
export {
  production, system, serial, factory, factoryWorker, tenant,
  intelligence, notice, dashboard, wechat, common,
  style, warehouse, material, materialRoll, orderManagement, sampleStock, finance,
};
