const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const USER_INFO_KEY = 'user_info';

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
    console.warn('[storage] getToken失败:', e.message || e);
    return '';
  }
}

function setToken(token) {
  try {
    wx.setStorageSync(TOKEN_KEY, token || '');
  } catch (e) {
    console.error('[storage] setToken失败:', e.message || e);
  }
}

function clearToken() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
  } catch (e) {
    console.warn('[storage] clearToken失败:', e.message || e);
  }
}

function getRefreshToken() {
  try {
    return wx.getStorageSync(REFRESH_TOKEN_KEY) || '';
  } catch (e) {
    console.warn('[storage] getRefreshToken失败:', e.message || e);
    return '';
  }
}

function setRefreshToken(token) {
  try {
    wx.setStorageSync(REFRESH_TOKEN_KEY, token || '');
  } catch (e) {
    console.error('[storage] setRefreshToken失败:', e.message || e);
  }
}

function clearRefreshToken() {
  try {
    wx.removeStorageSync(REFRESH_TOKEN_KEY);
  } catch (e) {
    console.warn('[storage] clearRefreshToken失败:', e.message || e);
  }
}

function getUserInfo() {
  try {
    const info = wx.getStorageSync(USER_INFO_KEY);
    return info || null;
  } catch (e) {
    console.warn('[storage] getUserInfo失败:', e.message || e);
    return null;
  }
}

function setUserInfo(userInfo) {
  try {
    wx.setStorageSync(USER_INFO_KEY, userInfo || null);
  } catch (e) {
    console.error('[storage] setUserInfo失败:', e.message || e);
  }
}

function clearUserInfo() {
  try {
    wx.removeStorageSync(USER_INFO_KEY);
  } catch (e) {
    console.warn('[storage] clearUserInfo失败:', e.message || e);
  }
}

function getUserRole() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.roleCode ? String(userInfo.roleCode).toLowerCase() : '';
}

function getUserRoleName() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.roleName ? userInfo.roleName : '';
}

function getUserTenantId() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.tenantId ? String(userInfo.tenantId) : '';
}

function isTenantOwner() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.isTenantOwner === true;
}

function isSuperAdmin() {
  const userInfo = getUserInfo();
  if (!userInfo) return false;
  const role = String(userInfo.roleCode || '').toLowerCase();
  return !userInfo.tenantId && (role === 'admin' || role === '管理员');
}

function isFactoryOwner() {
  const userInfo = getUserInfo();
  return userInfo && userInfo.isFactoryOwner === true;
}

function getStorageValue(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return v === null ? fallback : v;
  } catch (e) {
    console.warn('[storage] getStorageValue失败 key=' + key + ':', e.message || e);
    return fallback;
  }
}

function setStorageValue(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.error('[storage] setStorageValue失败 key=' + key + ':', e.message || e);
  }
}

function utf8Decode(str) {
  try {
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch (_e) {
    return decodeURIComponent(escape(str));
  }
}

function isTokenExpired() {
  try {
    const token = getToken();
    if (!token) return true;
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4 !== 0) payload += '=';
    const decoded = JSON.parse(utf8Decode(base64Decode(payload)));
    if (!decoded.exp) return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return decoded.exp < (nowSec + 300);
  } catch (e) {
    console.warn('[storage] isTokenExpired解析失败:', e.message || e);
    return true;
  }
}

module.exports = {
  getToken,
  setToken,
  clearToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  getUserInfo,
  setUserInfo,
  clearUserInfo,
  getUserRole,
  getUserRoleName,
  getUserTenantId,
  isTenantOwner,
  isSuperAdmin,
  isFactoryOwner,
  getStorageValue,
  setStorageValue,
  isTokenExpired,
};
