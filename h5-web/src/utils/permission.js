import { getUserRole, getUserRoleName, isTenantOwner, isSuperAdmin, getUserInfo } from './storage';

const ROLES = {
  ADMIN: 'admin', SUPERVISOR: 'supervisor', PURCHASER: 'purchaser',
  CUTTER: 'cutter', SEWING: 'sewing', PACKAGER: 'packager',
  QUALITY: 'quality', WAREHOUSE: 'warehouse',
};

function getCurrentRole() { return getUserRole() || ''; }

function isAdminOrSupervisor() {
  const role = getCurrentRole();
  return role === ROLES.ADMIN || role === ROLES.SUPERVISOR || isTenantOwner() || isSuperAdmin();
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
  if (isAdminOrSupervisor()) return 'all';
  const roleName = getUserRoleName() || '';
  if (roleName.includes('组长') || roleName.includes('班长')) return 'team';
  return 'own';
}

function getCurrentUserId() {
  const info = getUserInfo();
  return info ? (info.id || info.userId) : null;
}

export {
  ROLES, getCurrentRole, isAdminOrSupervisor, canAccessNode,
  filterWorkNodes, getAllowedScanTypes, canAccessScanPage,
  getRoleDisplayName, getDataScope, getCurrentUserId,
};
