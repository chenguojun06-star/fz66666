const { request, uploadFile } = require('./request');

function pickMessage(resp, fallback) {
  const msg = resp && resp.message !== null ? String(resp.message) : '';
  return msg || (fallback ? String(fallback) : '请求失败');
}

function createBizError(resp, fallback) {
  return {
    type: 'biz',
    code: resp && resp.code,
    errMsg: pickMessage(resp, fallback),
    resp,
  };
}

async function ok(url, method, data, options) {
  const resp = await request({ url, method, data, ...(options || {}) });
  if (resp && resp.code === 200) {
    return resp.data;
  }
  throw createBizError(resp, `${method} ${url}`);
}

async function raw(url, method, data, options) {
  return request({ url, method, data, ...(options || {}) });
}

const dashboard = {
  get(params) {
    return ok('/api/dashboard', 'GET', params || {});
  },
  getTopStats(params) {
    return ok('/api/dashboard/top-stats', 'GET', params || {});
  },
};

const production = {
  listOrders(params) {
    return ok('/api/production/order/list', 'GET', params || {});
  },
  createOutstock(payload) {
    return ok('/api/production/outstock', 'POST', payload || {});
  },
  /**
   * 查询订单详情（智能识别UUID或订单号）
   * @param {string} idOrOrderNo - 订单ID（UUID）或订单号
   * @returns {Promise} 订单详情
   */
  orderDetail(idOrOrderNo) {
    const value = String(idOrOrderNo || '').trim();
    // UUID格式检测：32位hex或标准UUID格式
    const uuidPattern =
      /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (uuidPattern.test(value)) {
      return ok(`/api/production/order/detail/${encodeURIComponent(value)}`, 'GET', {});
    }
    return ok('/api/production/order/list', 'GET', { orderNo: value });
  },
  // 通过订单号查询订单详情（用于扫码场景）
  orderDetailByOrderNo(orderNo) {
    const on = String(orderNo || '').trim();
    return ok('/api/production/order/list', 'GET', { orderNo: on });
  },
  updateProgress(payload) {
    return ok('/api/production/order/update-progress', 'POST', payload || {});
  },
  listWarehousing(params) {
    return ok('/api/production/warehousing/list', 'GET', params || {});
  },
  // 保存质检入库（新增）
  saveWarehousing(payload) {
    return ok('/api/production/warehousing', 'POST', payload || {});
  },
  listScans(params) {
    return ok('/api/production/scan/list', 'GET', params || {});
  },
  myScanHistory(params) {
    return ok('/api/production/scan/list', 'GET', { currentUser: 'true', ...(params || {}) });
  },
  personalScanStats(params) {
    return ok('/api/production/scan/personal-stats', 'GET', params || {});
  },
  executeScan(payload) {
    return ok('/api/production/scan/execute', 'POST', payload || {});
  },
  /**
   * 撤销扫码 - 仅允许1小时内、未结算、订单未完成的扫码记录
   * @param {Object} payload - { recordId: string, scanCode?: string, scanType?: string }
   */
  undoScan(payload) {
    return ok('/api/production/scan/undo', 'POST', payload || {});
  },
  /**
   * 退回重扫 - 仅允许1小时内的扫码记录
   * @param {Object} payload - { recordId: string }
   */
  rescan(payload) {
    return ok('/api/production/scan/rescan', 'POST', payload || {});
  },
  /**
   * 获取订单的工序配置（用于小程序扫码工序识别）
   * @param {string} orderNo - 订单号
   * @returns {Promise<Array>} 工序配置列表 [{processName, price, sortOrder, progressStage}, ...]
   */
  getProcessConfig(orderNo) {
    return ok(`/api/production/scan/process-config/${encodeURIComponent(orderNo)}`, 'GET', {});
  },
  rollbackByBundle(payload) {
    return ok('/api/production/warehousing/rollback-by-bundle', 'POST', payload || {});
  },
  receivePurchase(payload) {
    return ok('/api/production/purchase/receive', 'POST', payload || {});
  },
  createPurchaseInstruction(payload) {
    return ok('/api/production/purchase/instruction', 'POST', payload || {});
  },
  updateArrivedQuantity(payload) {
    return ok('/api/production/purchase/update-arrived-quantity', 'POST', payload || {});
  },
  // 通过订单号获取关联的采购单
  getMaterialPurchases(params) {
    const payload = { ...(params || {}) };
    // 确保 orderNo 作为 scanCode 传递，命中后端的 getByScanCode 精确查询路径
    // 否则会走 listWithEnrichment 分页路径，返回结构不是数组
    if (payload.orderNo && !payload.scanCode) {
      payload.scanCode = payload.orderNo;
    }
    return ok('/api/production/purchase/list', 'GET', payload);
  },
  // 获取我的采购任务
  myProcurementTasks() {
    return ok('/api/production/purchase/list', 'GET', { myTasks: 'true' });
  },
  // 获取我的裁剪任务
  myCuttingTasks() {
    return ok('/api/production/cutting-task/list', 'GET', { myTasks: 'true' });
  },
  // 获取我的质检待处理任务（已领取未确认结果）
  myQualityTasks() {
    return ok('/api/production/scan/my-quality-tasks', 'GET', {});
  },
  // 查询裁剪菲号信息（验证菲号是否存在，获取准确数量）
  getCuttingBundle(orderNo, bundleNo) {
    return ok('/api/production/cutting/list', 'GET', { orderNo, bundleNo });
  },
  // 生成裁剪菲号
  generateCuttingBundles(orderId, bundles) {
    return ok('/api/production/cutting/generate', 'POST', { orderId, bundles });
  },
  // 领取裁剪任务
  receiveCuttingTaskById(taskId, receiverId, receiverName) {
    return ok('/api/production/cutting-task/receive', 'POST', { taskId, receiverId, receiverName });
  },
  // 获取订单的裁剪任务（支持订单号或订单ID）
  getCuttingTaskByOrderId(orderIdOrNo) {
    // 后端接口用 orderNo 参数进行模糊匹配
    return ok('/api/production/cutting-task/list', 'GET', { orderNo: orderIdOrNo, pageSize: 1 });
  },
  // 获取样板生产详情
  getPatternDetail(patternId) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}`, 'GET', {});
  },
  // 获取样板动态工序配置（对齐大货动态工序）
  getPatternProcessConfig(patternId) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/process-config`, 'GET', {});
  },
  // 获取样板已扫记录
  getPatternScanRecords(patternId) {
    const id = String(patternId || '').trim();
    return ok(`/api/production/pattern/${encodeURIComponent(id)}/scan-records`, 'GET', {});
  },
  // 提交样板生产扫码
  submitPatternScan(payload) {
    return ok('/api/production/pattern/scan', 'POST', payload || {});
  },
};

const stock = {
  listSamples(params) {
    return ok('/api/stock/sample/list', 'GET', params || {});
  },
  inboundSample(payload) {
    return ok('/api/stock/sample/inbound', 'POST', payload || {});
  },
  loanSample(payload) {
    return ok('/api/stock/sample/loan', 'POST', payload || {});
  },
  returnSample(payload) {
    return ok('/api/stock/sample/return', 'POST', payload || {});
  },
  listSampleLoans(sampleStockId) {
    return ok('/api/stock/sample/loan/list', 'GET', { sampleStockId });
  },
};

const material = {
  listStockAlerts(params) {
    return ok('/api/production/material/stock/alerts', 'GET', params || {});
  },
  listBatchDetails(params) {
    return ok('/api/production/material/stock/batches', 'GET', params || {});
  },
  listPurchaseRecords(params) {
    return ok('/api/production/purchase/list', 'GET', params || {});
  },
};

const system = {
  getMe() {
    return ok('/api/system/user/me', 'GET', {});
  },
  listPendingUsers(params) {
    return ok('/api/system/user/pending', 'GET', params || {});
  },
  updateUser(userId, payload) {
    return ok(`/api/system/user/${userId}`, 'PUT', payload || {});
  },
  approveUser(userId) {
    return ok(`/api/system/user/${userId}/approve`, 'POST', {});
  },
  rejectUser(userId, payload) {
    return ok(`/api/system/user/${userId}/reject`, 'POST', payload || {});
  },
  listRoles(params) {
    return ok('/api/system/role/list', 'GET', params || {});
  },
  getOnlineCount() {
    return ok('/api/system/user/online-count', 'GET', {});
  },
  changePassword(oldPassword, newPassword) {
    return ok('/api/system/user/me/change-password', 'POST', { oldPassword, newPassword });
  },
  // 问题反馈
  submitFeedback(payload) {
    return ok('/api/system/feedback/submit', 'POST', payload || {});
  },
  myFeedbackList(params) {
    return ok('/api/system/feedback/my-list', 'POST', params || {});
  },
};

const style = {
  listStyles(params) {
    return ok('/api/style/info/list', 'GET', params || {});
  },
  // 获取BOM物料清单
  getBomList(params) {
    return ok('/api/style/bom/list', 'GET', params || {});
  },
  // 获取SKU库存
  getInventory(skuCode) {
    return ok(`/api/style/sku/inventory/${encodeURIComponent(skuCode)}`, 'GET', {});
  },
  // 更新库存
  updateInventory(payload) {
    return ok('/api/style/sku/inventory/update', 'POST', payload || {});
  }
};

const warehouse = {
  /** 成品库存列表（与PC端一致的API） */
  listFinishedInventory(params) {
    return ok('/api/warehouse/finished-inventory/list', 'GET', params || {});
  },
};

const orderManagement = {
  createFromStyle(payload) {
    return ok('/api/order-management/create-from-style', 'POST', payload || {});
  },
};

const tenant = {
  /** 获取活跃租户列表（公开接口，登录页用） */
  publicList() {
    return raw('/api/system/tenant/public-list', 'GET', {}, { skipAuthRedirect: true });
  },
  /** 获取当前用户所属租户信息 */
  myTenant() {
    return ok('/api/system/tenant/my', 'GET');
  },
  /** 工人自注册（无需登录） */
  workerRegister(payload) {
    return raw('/api/system/tenant/registration/register', 'POST', payload || {}, { skipAuthRedirect: true });
  },
  /** 待审批注册列表 */
  listPendingRegistrations(params) {
    return ok('/api/system/tenant/registrations/pending', 'POST', params || {});
  },
  /** 审批通过 */
  approveRegistration(userId, roleId) {
    return ok(`/api/system/tenant/registrations/${userId}/approve`, 'POST', { roleId });
  },
  /** 审批拒绝 */
  rejectRegistration(userId, reason) {
    return ok(`/api/system/tenant/registrations/${userId}/reject`, 'POST', { reason });
  },
};

const wechat = {
  miniProgramLogin(payload) {
    return raw('/api/wechat/mini-program/login', 'POST', payload || {}, { skipAuthRedirect: true });
  },
};

const common = {
  /**
   * 上传图片文件
   * @param {string} filePath - 文件临时路径
   * @param {Object} formData - 额外的表单数据（可选）
   * @returns {Promise<string>} - 上传成功后的图片URL
   */
  uploadImage(filePath, formData = {}) {
    return uploadFile({
      filePath,
      name: 'file',
      formData,
      url: '/api/common/upload',
    });
  },
};

// 面辅料料卷 API
const materialRoll = {
  /**
   * 扫码处理（查询/发料/退回）
   * action: 'query' | 'issue' | 'return'
   */
  scan(rollCode, action, extra) {
    return ok('/api/production/material/roll/scan', 'POST', {
      rollCode,
      action: action || 'query',
      cuttingOrderNo: (extra && extra.cuttingOrderNo) || undefined,
      operatorId: (extra && extra.operatorId) || undefined,
      operatorName: (extra && extra.operatorName) || undefined,
    });
  },
  /**
   * 查询入库单下所有料卷
   */
  listByInbound(inboundId) {
    return ok(`/api/production/material/roll/by-inbound/${encodeURIComponent(inboundId)}`, 'GET', {});
  },
};

const api = {
  dashboard,
  production,
  system,
  stock,
  material,
  materialRoll,
  style,
  warehouse,
  orderManagement,
  tenant,
  wechat,
  common,
};

module.exports = api;
module.exports.dashboard = dashboard;
module.exports.production = production;
module.exports.system = system;
module.exports.stock = stock;
module.exports.material = material;
module.exports.materialRoll = materialRoll;
module.exports.style = style;
module.exports.warehouse = warehouse;
module.exports.orderManagement = orderManagement;
module.exports.tenant = tenant;
module.exports.wechat = wechat;
module.exports.common = common;

