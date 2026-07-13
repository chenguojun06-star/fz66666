/**
 * 系统管理 API（system / serial / factory / factoryWorker / tenant）
 * 认证、用户管理、角色、组织、租户注册等
 */
const { ok, raw } = require('./helpers');

const system = {
  login(data) {
    return raw('/api/system/user/login', 'POST', data, { skipAuthRedirect: true });
  },
  getMe() {
    return ok('/api/system/user/me', 'GET', {});
  },
  listPendingUsers() {
    return ok('/api/system/user/pending', 'GET', {});
  },
  updateUser(userId, data) {
    return ok(`/api/system/user/${userId}`, 'PUT', data);
  },
  approveUser(userId, data) {
    return ok(`/api/system/user/${userId}/approval-action?action=approve`, 'POST', data || {});
  },
  rejectUser(userId, data) {
    return ok(`/api/system/user/${userId}/approval-action?action=reject`, 'POST', data || {});
  },
  listRoles() {
    return ok('/api/system/role/list', 'GET', {});
  },
  getOnlineCount() {
    return ok('/api/system/user/online-count', 'GET', {});
  },
  listOrganizationDepartments() {
    return ok('/api/system/organization/production-groups', 'GET', {});
  },
  changePassword(data) {
    return ok('/api/system/user/me/change-password', 'POST', data || {});
  },
  submitFeedback(data) {
    return ok('/api/system/feedback/submit', 'POST', data || {});
  },
  myFeedbackList(params) {
    return ok('/api/system/feedback/my-list', 'POST', params || {});
  },
  getDictList(type) {
    return ok('/api/system/dict/list-by-type', 'POST', { type });
  },
  getMiniprogramMenuConfig() {
    return ok('/api/system/tenant-miniprogram-menu/my-menus', 'GET', {});
  },
  saveMiniprogramMenuConfig(menus) {
    return ok('/api/system/tenant-miniprogram-menu', 'PUT', { menus });
  },
  getMiniprogramMenuRoles() {
    return ok('/api/system/tenant-miniprogram-menu/menu-roles', 'GET', {});
  },
  getMiniprogramMenuMeta() {
    return ok('/api/system/tenant-miniprogram-menu/menu-meta', 'GET', {});
  },
  saveMiniprogramMenuRoleConfig(roleMenus) {
    return ok('/api/system/tenant-miniprogram-menu/menu-roles', 'PUT', { roleMenus });
  },
  // 收藏应用API
  _favFailCount: 0,
  getFavoriteApps() {
    // 连续失败时仍然请求服务端，只是增加延迟避免频繁请求
    // 绝不能跳过请求，否则清除缓存后本地空+服务端不请求=收藏丢失
    return ok('/api/system/user/favorite-apps', 'GET', {}).then(function (res) {
      system._favFailCount = 0;
      return res;
    }).catch(function () {
      system._favFailCount++;
      return { favoriteData: '[]' };
    });
  },
  saveFavoriteApps(favoriteData) {
    return ok('/api/system/user/favorite-apps', 'PUT', { favoriteData: favoriteData }).catch(function () {
      return { success: false };
    });
  },
};

const serial = {
  generate(ruleCode) {
    return ok('/api/system/serial/generate', 'GET', { ruleCode });
  },
};

const factory = {
  list(params) {
    return ok('/api/system/factory/list', 'GET', params || {});
  },
};

const factoryWorker = {
  list(factoryId) {
    return ok('/api/factory-worker/list', 'GET', { factoryId });
  },
  save(data) {
    return ok('/api/factory-worker', 'POST', data || {});
  },
  remove(id) {
    return ok(`/api/factory-worker/${id}`, 'DELETE', {});
  },
};

const tenant = {
  publicList() {
    return raw('/api/system/tenant/public-list', 'GET', {}, { skipAuthRedirect: true });
  },
  myTenant() {
    return ok('/api/system/tenant/my', 'GET', {});
  },
  workerRegister(data) {
    return raw('/api/system/tenant/registration/register', 'POST', data || {}, { skipAuthRedirect: true });
  },
  listPendingRegistrations() {
    return ok('/api/system/tenant/registrations/pending', 'POST', {});
  },
  approveRegistration(id, data) {
    return ok(`/api/system/tenant/registrations/${id}/approve`, 'POST', data || {});
  },
  rejectRegistration(id, data) {
    return ok(`/api/system/tenant/registrations/${id}/reject`, 'POST', data || {});
  },
};

module.exports = { system, serial, factory, factoryWorker, tenant };
