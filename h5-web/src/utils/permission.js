import { getUserRole, getUserRoleName, isTenantOwner, isSuperAdmin, isFactoryOwner, getUserInfo } from './storage';

const ROLES = {
  ADMIN: 'admin', SUPER_ADMIN: 'super_admin', SUPERVISOR: 'supervisor',
  MANAGER: 'manager', MERCHANDISER: 'merchandiser',
  TENANT_ADMIN: 'tenant_admin', TENANT_MANAGER: 'tenant_manager',
  PURCHASER: 'purchaser', CUTTER: 'cutter', SEWING: 'sewing',
  PACKAGER: 'packager', QUALITY: 'quality', WAREHOUSE: 'warehouse',
};

const MANAGER_ROLES = [
  ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR, ROLES.MANAGER,
  ROLES.MERCHANDISER, ROLES.TENANT_ADMIN, ROLES.TENANT_MANAGER,
];

function getCurrentRole() { return (getUserRole() || '').toLowerCase(); }

function isManagerLevel() {
  if (isTenantOwner() || isSuperAdmin() || isFactoryOwner()) return true;
  const role = getCurrentRole();
  return MANAGER_ROLES.some(r => role.includes(r) || r.includes(role))
    || role.includes('跟单') || role.includes('主管') || role.includes('管理')
    || role.includes('组长') || role.includes('班长') || role.includes('厂长')
    || role.includes('老板') || role.includes('director') || role.includes('head');
}

function isAdminOrSupervisor() {
  const role = getCurrentRole();
  return role === ROLES.ADMIN || role === ROLES.SUPERVISOR
    || role === ROLES.SUPER_ADMIN || isTenantOwner() || isSuperAdmin();
}

function canAccessNode(nodeName) {
  if (isAdminOrSupervisor()) return true;
  const role = getCurrentRole();
  const name = String(nodeName || '').trim();
  const roleNodeMap = {
    [ROLES.PURCHASER]: ['采购', '物料'],
    [ROLES.CUTTER]: ['裁剪'],
    [ROLES.SEWING]: ['生产', '车缝', '缝制', '大烫', '整烫', '整件'],
    [ROLES.PACKAGER]: ['包装'],
    [ROLES.QUALITY]: ['质检'],
    [ROLES.WAREHOUSE]: ['入库', '出库', '仓库'],
  };
  const allowedNodes = roleNodeMap[role] || [];
  return allowedNodes.some((n) => name.includes(n) || n.includes(name));
}

function filterWorkNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  if (isAdminOrSupervisor()) return nodes;
  return nodes.filter((node) => node && node.name && canAccessNode(node.name));
}

function getAllowedScanTypes() {
  if (isAdminOrSupervisor()) return ['procurement', 'cutting', 'production', 'sewing', 'ironing', 'packaging', 'quality', 'warehouse'];
  const role = getCurrentRole();
  const roleScanTypeMap = {
    [ROLES.PURCHASER]: ['procurement'],
    [ROLES.CUTTER]: ['cutting'],
    [ROLES.SEWING]: ['production', 'sewing', 'ironing'],
    [ROLES.PACKAGER]: ['packaging'],
    [ROLES.QUALITY]: ['quality'],
    [ROLES.WAREHOUSE]: ['warehouse'],
  };
  return roleScanTypeMap[role] || [];
}

function canAccessScanPage() { return getAllowedScanTypes().length > 0; }

function getRoleDisplayName() {
  const roleName = getUserRoleName();
  if (roleName) return roleName;
  const role = getCurrentRole();
  const map = {
    [ROLES.ADMIN]: '管理员', [ROLES.SUPERVISOR]: '主管', [ROLES.PURCHASER]: '采购员',
    [ROLES.CUTTER]: '裁剪员', [ROLES.SEWING]: '车缝员', [ROLES.PACKAGER]: '包装员',
    [ROLES.QUALITY]: '质检员', [ROLES.WAREHOUSE]: '仓管员',
  };
  return map[role] || '员工';
}

function getDataScope() {
  if (isManagerLevel()) return 'all';
  const roleName = getUserRoleName() || '';
  if (roleName.includes('组长') || roleName.includes('班长')) return 'team';
  return 'own';
}

function hasFeaturePermission(feature) {
  if (isManagerLevel()) return true;
  const role = getCurrentRole();
  const workerFeatures = {
    [ROLES.PURCHASER]: ['scan', 'view_orders', 'view_own_payroll'],
    [ROLES.CUTTER]: ['scan', 'view_orders', 'view_own_payroll'],
    [ROLES.SEWING]: ['scan', 'view_orders', 'view_own_payroll'],
    [ROLES.PACKAGER]: ['scan', 'view_orders', 'view_own_payroll'],
    [ROLES.QUALITY]: ['scan', 'view_orders', 'view_own_payroll'],
    [ROLES.WAREHOUSE]: ['scan', 'view_orders', 'view_own_payroll'],
  };
  const allowed = workerFeatures[role] || [];
  return allowed.includes(feature);
}

function filterByDataScope(list, options = {}) {
  if (!Array.isArray(list)) return [];
  const scope = getDataScope();
  const userId = getCurrentUserId();
  const idField = options.idField || 'operatorId';
  const teamField = options.teamField || 'teamId';
  if (scope === 'all') return list;
  if (scope === 'team') {
    const info = getUserInfo() || {};
    const myTeam = info[teamField] || info.factoryId;
    if (!myTeam) return list.filter(item => String(item[idField]) === String(userId));
    return list.filter(item => String(item[teamField]) === String(myTeam) || String(item[idField]) === String(userId));
  }
  return list.filter(item => String(item[idField]) === String(userId));
}

function buildScopedParams(params = {}) {
  const scope = getDataScope();
  const userId = getCurrentUserId();
  const p = { ...params };
  if (scope === 'own' && userId) p.currentUser = 'true';
  if (scope === 'team' && userId) p.currentUser = 'true';
  return p;
}

function getCurrentUserId() {
  const info = getUserInfo();
  return info ? (info.id || info.userId) : null;
}

function canSeeDashboard() {
  return isTenantOwner() || isManagerLevel();
}

export {
  ROLES, MANAGER_ROLES, getCurrentRole, isManagerLevel, isAdminOrSupervisor,
  canAccessNode, filterWorkNodes, getAllowedScanTypes, canAccessScanPage,
  getRoleDisplayName, getDataScope, hasFeaturePermission,
  filterByDataScope, buildScopedParams, getCurrentUserId, canSeeDashboard,
};
