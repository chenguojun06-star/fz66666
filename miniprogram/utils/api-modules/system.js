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
  updateUser(data) {
    return ok('/api/system/user', 'PUT', data);
  },
  approveUser(userId) {
    return ok(`/api/system/user/${userId}/approval-action?action=approve`, 'POST', {});
  },
  rejectUser(userId) {
    return ok(`/api/system/user/${userId}/approval-action?action=reject`, 'POST', {});
  },
  listRoles() {
    return ok('/api/system/roles/list', 'GET', {});
  },
  getOnlineCount() {
    return ok('/api/system/user/online-count', 'GET', {});
  },
  listOrganizationDepartments() {
    return ok('/api/system/organization/departments', 'GET', {});
  },
  changePassword(data) {
    return ok('/api/system/user/me/change-password', 'POST', data || {});
  },
  submitFeedback(data) {
    return ok('/api/feedback', 'POST', data || {});
  },
  myFeedbackList(params) {
    return ok('/api/feedback/list', 'GET', params || {});
  },
  getDictList(type) {
    return ok('/api/system/dictionary/list', 'GET', { type });
  },
};

const serial = {
  generate(type) {
    return ok('/api/serial/generate', 'GET', { type });
  },
};

const factory = {
  list(params) {
    return ok('/api/system/factories/list', 'GET', params || {});
  },
};

const factoryWorker = {
  list(factoryId) {
    return ok('/api/system/factory-workers/list', 'GET', { factoryId });
  },
  save(data) {
    return ok('/api/system/factory-workers', 'POST', data || {});
  },
  remove(id) {
    return ok(`/api/system/factory-workers/${id}`, 'DELETE', {});
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
  approveRegistration(id) {
    return ok(`/api/system/tenant/registrations/${id}/approve`, 'POST', {});
  },
  rejectRegistration(id) {
    return ok(`/api/system/tenant/registrations/${id}/reject`, 'POST', {});
  },
};

module.exports = { system, serial, factory, factoryWorker, tenant };
