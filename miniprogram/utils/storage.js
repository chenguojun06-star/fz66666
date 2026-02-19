const TOKEN_KEY = 'auth_token';
const USER_INFO_KEY = 'user_info';

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setToken(token) {
  try {
    wx.setStorageSync(TOKEN_KEY, token || '');
  } catch (e) {
    null;
  }
}

function clearToken() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
  } catch (e) {
    null;
  }
}

// 用户信息存储（包含角色权限）
function getUserInfo() {
  try {
    const info = wx.getStorageSync(USER_INFO_KEY);
    return info || null;
  } catch (e) {
    return null;
  }
}

function setUserInfo(userInfo) {
  try {
    wx.setStorageSync(USER_INFO_KEY, userInfo || null);
  } catch (e) {
    null;
  }
}

function clearUserInfo() {
  try {
    wx.removeStorageSync(USER_INFO_KEY);
  } catch (e) {
    null;
  }
}

// 获取用户角色代码
function getUserRole() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.roleCode ? String(userInfo.roleCode).toLowerCase() : '';
}

// 获取用户角色名称
function getUserRoleName() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.roleName ? userInfo.roleName : '';
}

// 获取用户租户ID
function getUserTenantId() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.tenantId ? String(userInfo.tenantId) : '';
}

// 判断是否为租户主账号
function isTenantOwner() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.isTenantOwner === true;
}

// 判断是否为超级管理员（无租户限制）
function isSuperAdmin() {
  const userInfo = getUserInfo();
  if (!userInfo) return false;
  const role = String(userInfo.roleCode || '').toLowerCase();
  return !userInfo.tenantId && (role === 'admin' || role === '管理员');
}

function getStorageValue(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function setStorageValue(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    null;
  }
}

module.exports = {
  getToken,
  setToken,
  clearToken,
  getUserInfo,
  setUserInfo,
  clearUserInfo,
  getUserRole,
  getUserRoleName,
  getUserTenantId,
  isTenantOwner,
  isSuperAdmin,
  getStorageValue,
  setStorageValue,
};
