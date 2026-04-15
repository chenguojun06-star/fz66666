const TOKEN_KEY = 'fashion_token';
const USER_KEY = 'fashion_user_info';
const TENANT_KEY = 'fashion_tenant_info';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, String(token || ''));
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getUserInfo() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setUserInfo(info) {
  if (info) {
    localStorage.setItem(USER_KEY, JSON.stringify(info));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function clearUserInfo() {
  localStorage.removeItem(USER_KEY);
}

function getTenantInfo() {
  try {
    const raw = localStorage.getItem(TENANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setTenantInfo(info) {
  if (info) {
    localStorage.setItem(TENANT_KEY, JSON.stringify(info));
  } else {
    localStorage.removeItem(TENANT_KEY);
  }
}

function isTokenExpired() {
  const token = getToken();
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    let payload = parts[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(atob(payload));
    if (!decoded.exp) return false;
    return Date.now() / 1000 > decoded.exp - 300;
  } catch (e) {
    return false;
  }
}

function getUserRole() {
  const info = getUserInfo();
  return info ? (info.role || info.roleCode || '') : '';
}

function getUserRoleName() {
  const info = getUserInfo();
  return info ? (info.roleName || '') : '';
}

function isTenantOwner() {
  const info = getUserInfo();
  return !!(info && info.isTenantOwner);
}

function isFactoryOwner() {
  const info = getUserInfo();
  return !!(info && info.isFactoryOwner);
}

function isSuperAdmin() {
  const info = getUserInfo();
  if (!info) return false;
  const role = String(info.role || info.roleCode || '').toLowerCase();
  return role === 'super_admin' || role === 'admin';
}

function getStorageSync(key) {
  try { return localStorage.getItem(key); } catch (e) { return ''; }
}

function setStorageSync(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* ignore */ }
}

function removeStorageSync(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

function clearBusinessCaches() {
  const keys = [
    'pending_cutting_task', 'pending_procurement_task', 'pending_quality_task',
    'pending_repair_task', 'pending_order_hint', 'highlight_order_no',
    'mp_scan_type_index', 'work_active_tab', 'scan_history_v2',
    'pending_reminders', 'bundle_split_records', 'ai_chat_history',
    'ai_trigger_position', 'warehouse_chips',
  ];
  keys.forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
}

export {
  TOKEN_KEY, USER_KEY, TENANT_KEY,
  getToken, setToken, clearToken,
  getUserInfo, setUserInfo, clearUserInfo,
  getTenantInfo, setTenantInfo,
  isTokenExpired, getUserRole, getUserRoleName,
  isTenantOwner, isFactoryOwner, isSuperAdmin,
  getStorageSync, setStorageSync, removeStorageSync,
  clearBusinessCaches,
};
