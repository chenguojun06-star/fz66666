const TOKEN_KEY = 'auth_token';
const USER_INFO_KEY = 'user_info';

/**
 * 小程序环境没有 atob，手写 Base64 解码
 * 支持标准 Base64（已补 padding）
 */
function base64Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  str = str.replace(/=+$/, '');
  for (let i = 0, len = str.length; i < len; i += 4) {
    const enc1 = chars.indexOf(str[i]);
    const enc2 = chars.indexOf(str[i + 1]);
    const enc3 = i + 2 < len ? chars.indexOf(str[i + 2]) : 0;
    const enc4 = i + 3 < len ? chars.indexOf(str[i + 3]) : 0;
    output += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
    if (i + 2 < len && str[i + 2] !== '=') {
      output += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
    }
    if (i + 3 < len && str[i + 3] !== '=') {
      output += String.fromCharCode(((enc3 & 3) << 6) | enc4);
    }
  }
  return output;
}

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

/**
 * 检查 JWT token 是否已过期
 * 解码 JWT payload（base64），读取 exp 字段
 * @returns {boolean} true=已过期或无法解析，false=未过期
 */
function isTokenExpired() {
  try {
    const token = getToken();
    if (!token) return true;
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    // base64url → base64 → decode
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // 补齐 padding
    while (payload.length % 4 !== 0) payload += '=';
    const decoded = JSON.parse(decodeURIComponent(escape(base64Decode(payload))));
    if (!decoded.exp) return false; // 无过期时间视为永不过期
    const nowSec = Math.floor(Date.now() / 1000);
    // 提前5分钟视为过期，避免请求途中过期
    return decoded.exp < (nowSec + 300);
  } catch (e) {
    console.warn('[isTokenExpired] 解析token失败:', e.message);
    return false; // 解析失败不强制过期，由后端判断
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
  isTokenExpired,
};
