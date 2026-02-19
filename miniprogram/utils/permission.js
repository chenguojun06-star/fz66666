/**
 * 权限管理工具
 * 根据用户角色控制小程序页面和功能的访问权限
 */

const { getUserRole, getUserRoleName } = require('./storage');

// 角色定义
const ROLES = {
  ADMIN: 'admin', // 管理员 - 全部权限
  SUPERVISOR: 'supervisor', // 主管 - 全部权限
  PURCHASER: 'purchaser', // 采购员 - 只看物料采购
  CUTTER: 'cutter', // 裁剪员 - 只看裁剪任务和裁剪单
  SEWING: 'sewing', // 车缝员 - 只看车缝/生产扫码
  PACKAGER: 'packager', // 包装员 - 只看包装扫码
  QUALITY: 'quality', // 质检员 - 只看质检相关
  WAREHOUSE: 'warehouse', // 仓管员 - 只看入库/出库
};

// 工作流程节点定义
const WORK_NODES = {
  CUTTING: 'cutting', // 裁剪
  PRODUCTION: 'production', // 生产/车缝
  SEWING: 'sewing', // 车缝
  QUALITY: 'quality', // 质检
  PACKAGING: 'packaging', // 包装
  WAREHOUSING: 'warehouse', // 入库
};

/**
 * 获取当前用户角色
 */
function getCurrentRole() {
  return getUserRole() || '';
}

/**
 * 检查是否为管理员或主管
 */
function isAdminOrSupervisor() {
  const role = getCurrentRole();
  return role === ROLES.ADMIN || role === ROLES.SUPERVISOR;
}

/**
 * 检查用户是否有权限访问指定工作节点
 * @param {string} nodeName - 节点名称（如 '裁剪'、'质检'、'包装' 等）
 * @returns {boolean}
 */
function canAccessNode(nodeName) {
  // 管理员和主管可以访问所有节点
  if (isAdminOrSupervisor()) {
    return true;
  }

  const role = getCurrentRole();
  const name = String(nodeName || '').trim();

  // 角色权限映射
  const roleNodeMap = {
    [ROLES.PURCHASER]: ['采购', '物料'],
    [ROLES.CUTTER]: ['裁剪'],
    [ROLES.SEWING]: ['生产', '车缝', '缝制', '大烫'],
    [ROLES.PACKAGER]: ['包装'],
    [ROLES.QUALITY]: ['质检'],
    [ROLES.WAREHOUSE]: ['入库', '出库', '仓库'],
  };

  const allowedNodes = roleNodeMap[role] || [];
  return allowedNodes.some(n => name.includes(n) || n.includes(name));
}

/**
 * 过滤工作流程节点列表（根据用户权限）
 * @param {Array} nodes - 节点列表 [{id, name}, ...]
 * @returns {Array} 过滤后的节点列表
 */
function filterWorkNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return [];
  }

  // 管理员和主管可以看到所有节点
  if (isAdminOrSupervisor()) {
    return nodes;
  }

  // 根据角色过滤节点
  return nodes.filter(node => {
    if (!node || !node.name) {
      return false;
    }
    return canAccessNode(node.name);
  });
}

/**
 * 过滤订单列表（根据用户权限）
 * @param {Array} orders - 订单列表
 * @returns {Array} 过滤后的订单列表
 */
function filterOrders(orders) {
  if (!Array.isArray(orders)) {
    return [];
  }

  // 管理员和主管可以看到所有订单
  if (isAdminOrSupervisor()) {
    return orders;
  }

  const role = getCurrentRole();

  // 根据角色过滤订单
  return orders.filter(order => {
    if (!order) {
      return false;
    }

    const currentProcess = String(order.currentProcessName || '').trim();

    // 采购员：只看待采购或采购中的订单
    if (role === ROLES.PURCHASER) {
      return currentProcess.includes('采购') || currentProcess.includes('物料');
    }

    // 裁剪员：只看裁剪节点的订单
    if (role === ROLES.CUTTER) {
      return currentProcess.includes('裁剪');
    }

    // 车缝员：只看生产/车缝节点的订单
    if (role === ROLES.SEWING) {
      return (
        currentProcess.includes('生产') ||
        currentProcess.includes('车缝') ||
        currentProcess.includes('缝制') ||
        currentProcess.includes('大烫')
      );
    }

    // 包装员：只看包装节点的订单
    if (role === ROLES.PACKAGER) {
      return currentProcess.includes('包装');
    }

    // 质检员：只看质检节点的订单
    if (role === ROLES.QUALITY) {
      return currentProcess.includes('质检');
    }

    // 仓管员：只看入库/出库节点的订单
    if (role === ROLES.WAREHOUSE) {
      return (
        currentProcess.includes('入库') ||
        currentProcess.includes('出库') ||
        currentProcess.includes('仓库')
      );
    }

    return false;
  });
}

/**
 * 获取用户可见的扫码类型
 * @returns {Array} 扫码类型列表
 */
function getAllowedScanTypes() {
  // 管理员和主管可以使用所有扫码类型
  if (isAdminOrSupervisor()) {
    return [
      'procurement',
      'cutting',
      'production',
      'sewing',
      'ironing',
      'packaging',
      'quality',
      'warehouse',
    ];
  }

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

/**
 * 检查是否可以访问扫码页面
 * @returns {boolean}
 */
function canAccessScanPage() {
  return getAllowedScanTypes().length > 0;
}

/**
 * 获取角色的中文名称
 * @returns {string}
 */
function getRoleDisplayName() {
  const roleName = getUserRoleName();
  if (roleName) {
    return roleName;
  }

  const role = getCurrentRole();
  const roleNameMap = {
    [ROLES.ADMIN]: '管理员',
    [ROLES.SUPERVISOR]: '主管',
    [ROLES.PURCHASER]: '采购员',
    [ROLES.CUTTER]: '裁剪员',
    [ROLES.SEWING]: '车缝员',
    [ROLES.PACKAGER]: '包装员',
    [ROLES.QUALITY]: '质检员',
    [ROLES.WAREHOUSE]: '仓管员',
  };

  return roleNameMap[role] || '员工';
}

/**
 * 获取角色对应的权限列表（预定义）
 * @returns {Array<string>}
 */
function getRolePermissions() {
  // 直接返回角色名称，不返回权限模块列表
  const roleName = getRoleDisplayName();
  return roleName ? [roleName] : [];
}

/**
 * 检查是否有特定功能权限
 * @param {string} feature - 功能名称
 * @returns {boolean}
 */
function hasFeaturePermission(feature) {
  // 管理员和主管拥有所有权限
  if (isAdminOrSupervisor()) {
    return true;
  }

  const role = getCurrentRole();

  // 功能权限映射
  const featurePermissions = {
    // 创建订单
    create_order: [ROLES.ADMIN, ROLES.SUPERVISOR],
    // 编辑订单
    edit_order: [ROLES.ADMIN, ROLES.SUPERVISOR],
    // 删除订单
    delete_order: [ROLES.ADMIN, ROLES.SUPERVISOR],
    // 查看订单详情
    view_order: [
      ROLES.ADMIN,
      ROLES.SUPERVISOR,
      ROLES.PURCHASER,
      ROLES.CUTTER,
      ROLES.SEWING,
      ROLES.PACKAGER,
      ROLES.QUALITY,
      ROLES.WAREHOUSE,
    ],
    // 扫码
    scan: [
      ROLES.ADMIN,
      ROLES.SUPERVISOR,
      ROLES.CUTTER,
      ROLES.SEWING,
      ROLES.PACKAGER,
      ROLES.QUALITY,
      ROLES.WAREHOUSE,
    ],
    // 查看所有记录
    view_all_records: [ROLES.ADMIN, ROLES.SUPERVISOR],
  };

  const allowedRoles = featurePermissions[feature] || [];
  return allowedRoles.includes(role);
}

// ==================================================
// 数据隔离功能（2026-02-05 新增）
// 用于小程序端按用户角色过滤数据，确保数据安全
// ==================================================

/**
 * 获取当前用户的数据范围
 * @returns {'all'|'team'|'own'} 数据范围
 *   - all: 管理员/主管，可查看全部数据
 *   - team: 组长/班长，可查看本组数据
 *   - own: 普通员工，仅查看自己的数据
 */
function getDataScope() {
  if (isAdminOrSupervisor()) {
    return 'all';
  }

  const role = getCurrentRole();
  const roleName = getUserRoleName() || '';

  // 组长/班长级别可查看团队数据
  if (
    roleName.includes('组长') ||
    roleName.includes('班长') ||
    roleName.includes('leader') ||
    role === 'team_leader'
  ) {
    return 'team';
  }

  return 'own';
}

/**
 * 获取当前用户ID（从本地缓存读取）
 * @returns {string|null}
 */
function getCurrentUserId() {
  try {
    const userInfo = wx.getStorageSync('user_info');
    return userInfo ? userInfo.id || userInfo.userId : null;
  } catch (e) {
    return null;
  }
}

/**
 * 获取当前用户所属工厂ID
 * @returns {string|null}
 */
function getCurrentFactoryId() {
  try {
    const userInfo = wx.getStorageSync('user_info');
    return userInfo ? userInfo.factoryId || userInfo.teamId : null;
  } catch (e) {
    return null;
  }
}

/**
 * 按数据范围过滤列表数据
 * 在小程序端进行二次过滤（主过滤由后端 DataPermissionInterceptor 完成）
 *
 * @param {Array} list - 数据列表
 * @param {Object} options - 过滤选项
 * @param {string} [options.creatorField='creatorId'] - 创建人ID字段名
 * @param {string} [options.factoryField='factoryId'] - 工厂ID字段名
 * @returns {Array} 过滤后的列表
 *
 * @example
 * const orders = filterByDataScope(allOrders, { creatorField: 'createdById' });
 */
function filterByDataScope(list, options = {}) {
  if (!Array.isArray(list) || list.length === 0) {
    return list || [];
  }

  const scope = getDataScope();

  // 管理员看全部
  if (scope === 'all') {
    return list;
  }

  const creatorField = options.creatorField || 'creatorId';
  const factoryField = options.factoryField || 'factoryId';

  const userId = getCurrentUserId();
  const factoryId = getCurrentFactoryId();

  if (scope === 'team' && factoryId) {
    // 团队范围：按工厂/团队过滤
    return list.filter(item => {
      if (!item) return false;
      return item[factoryField] === factoryId;
    });
  }

  // own 范围：仅自己的数据
  if (userId) {
    return list.filter(item => {
      if (!item) return false;
      return item[creatorField] === userId;
    });
  }

  return list;
}

/**
 * 构建带数据范围的 API 请求参数
 * 后端 @DataScope 注解会自动过滤，此方法用于辅助前端传参
 *
 * @param {Object} params - 原始请求参数
 * @returns {Object} 增强后的参数（含 dataScope 信息）
 */
function buildScopedParams(params = {}) {
  const scope = getDataScope();
  const enhanced = { ...params };

  if (scope !== 'all') {
    enhanced._dataScope = scope;
    enhanced._currentUserId = getCurrentUserId();
    enhanced._currentFactoryId = getCurrentFactoryId();
  }

  return enhanced;
}

module.exports = {
  ROLES,
  WORK_NODES,
  getCurrentRole,
  isAdminOrSupervisor,
  canAccessNode,
  filterWorkNodes,
  filterOrders,
  getAllowedScanTypes,
  canAccessScanPage,
  getRoleDisplayName,
  getRolePermissions,
  hasFeaturePermission,
  // 数据隔离
  getDataScope,
  getCurrentUserId,
  getCurrentFactoryId,
  filterByDataScope,
  buildScopedParams,
};
