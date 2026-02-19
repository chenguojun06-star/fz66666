/**
 * 铃铛组件 - 任务加载模块
 * 从 floating-bell/index.js 提取，负责各类任务的数据加载
 */
const api = require('../../utils/api');
const reminderManager = require('../../utils/reminderManager');
const storage = require('../../utils/storage');
const { loadOverdueOrders, summarizeOverdueOrders } = require('./overdueOrderLoader');

/**
 * 格式化时间为友好显示
 * @param {string|number} time - 时间字符串或时间戳
 * @returns {string} 友好时间文本（如"刚刚"、"5分钟前"）
 */
function formatTimeAgo(time) {
  if (!time) {
    return '';
  }
  const date = new Date(time);
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return '刚刚';
  }
  if (minutes < 60) {
    return `${minutes}分钟前`;
  }
  if (hours < 24) {
    return `${hours}小时前`;
  }
  if (days < 7) {
    return `${days}天前`;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

/**
 * 检查当前用户是否是管理员
 * @returns {boolean} 是否为管理员角色
 */
function checkIsAdmin() {
  try {
    const userInfo = wx.getStorageSync('user_info');
    if (!userInfo) {
      return false;
    }
    const role = String(userInfo.role || userInfo.roleCode || '').toLowerCase();
    return ['admin', 'supervisor', 'super_admin', 'manager'].includes(role);
  } catch (e) {
    return false;
  }
}

/**
 * 检查当前用户是否是租户主账号
 * @returns {boolean} 是否为租户主账号
 */
function checkIsTenantOwner() {
  try {
    return storage.isTenantOwner();
  } catch (e) {
    return false;
  }
}

/**
 * 检查当前用户是否能管理员工注册（租户主账号或租户内管理员）
 * @returns {boolean}
 */
function checkCanManageRegistrations() {
  try {
    const userInfo = wx.getStorageSync('user_info');
    if (!userInfo) {
      return false;
    }
    // 租户主账号直接允许
    if (userInfo.isTenantOwner === true) {
      return true;
    }
    // 租户内管理员（有 tenantId 且是管理角色）
    const hasTenant = !!userInfo.tenantId;
    const role = String(userInfo.role || userInfo.roleCode || '').toLowerCase();
    const isMgr = ['admin', 'manager', 'supervisor', 'tenant_admin', 'tenant_manager'].includes(role);
    return hasTenant && isMgr;
  } catch (e) {
    return false;
  }
}

/**
 * 加载裁剪任务（已领取待完成）
 * @returns {Promise<Array>} 裁剪任务列表
 */
async function loadCuttingTasks() {
  try {
    const res = await api.production.myCuttingTasks();
    const list = Array.isArray(res) ? res : res?.records || [];

    return list.map(item => ({
      ...item,
      id: item.id || item.taskId,
      orderNo: item.productionOrderNo || item.orderNo,
      receivedTimeText: formatTimeAgo(item.receivedTime),
    }));
  } catch (err) {
    console.error('加载裁剪任务失败:', err);
    return [];
  }
}

/**
 * 加载采购任务（已领取待完成）
 * @returns {Promise<Array>} 采购任务列表
 */
async function loadProcurementTasks() {
  try {
    const res = await api.production.myProcurementTasks();
    const list = Array.isArray(res) ? res : res?.records || [];

    const mapped = list.map(item => ({
      ...item,
      id: item.id || item.purchaseId,
      orderNo: item.orderNo || item.productionOrderNo || '',
      styleNo: item.styleNo || '',
      materialName: item.materialName || '未知物料',
      purchaseQuantity: item.purchaseQuantity || 0,
      arrivedQuantity: item.arrivedQuantity || 0,
      unit: item.unit || '米',
      receivedTimeText: formatTimeAgo(item.receivedTime),
    }));


    return mapped;
  } catch (err) {
    console.error('[loadProcurementTasks] 加载失败:', err);
    return [];
  }
}

/**
 * 加载质检待处理任务
 * @returns {Promise<Array>} 质检任务列表
 */
async function loadQualityTasks() {
  try {
    const res = await api.production.myQualityTasks();
    const list = Array.isArray(res) ? res : res?.records || [];

    return list.map(item => ({
      ...item,
      id: item.id || item.scanId,
      orderId: item.orderId || '',
      orderNo: item.orderNo,
      bundleId: item.cuttingBundleId || '',
      bundleNo: item.cuttingBundleNo || item.bundleNo || '',
      styleNo: item.styleNo || '',
      color: item.color || '',
      size: item.size || '',
      quantity: item.quantity || 1,
      scanCode: item.scanCode || '',
      receivedTimeText: formatTimeAgo(item.scanTime || item.createdAt),
    }));
  } catch (err) {
    console.error('加载质检任务失败:', err);
    return [];
  }
}

/**
 * 加载超时提醒（从本地 reminderManager）
 * @returns {Array} 超时提醒列表
 */
function loadTimeoutReminders() {
  try {
    const allReminders = reminderManager.getReminders();
    const now = Date.now();
    const REMINDER_INTERVAL = 10 * 60 * 60 * 1000; // 10小时

    const pendingReminders = allReminders.filter(r => {
      const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
      return baseTime > 0 && now - baseTime >= REMINDER_INTERVAL;
    });

    return pendingReminders.map(r => {
      const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
      const hours = baseTime > 0 ? Math.floor((now - baseTime) / (60 * 60 * 1000)) : 0;
      const timeAgo = hours < 24 ? `${hours}小时` : `${Math.floor(hours / 24)}天`;

      return {
        id: r.id || `${r.orderNo}_${r.type}`,
        orderNo: r.orderNo || '',
        type: r.type || '待处理',
        timeAgo,
      };
    });
  } catch (err) {
    console.error('加载超时提醒失败:', err);
    return [];
  }
}

/**
 * 加载待审批用户（仅管理员）
 * @returns {Promise<Array>} 待审批用户列表
 */
async function loadPendingUsers() {
  try {
    const res = await api.system.listPendingUsers({ page: 1, pageSize: 10 });
    const list = res?.records || [];

    return list.map(item => ({
      id: item.id,
      name: item.name || item.username || '未知用户',
      phone: item.phone || '',
      createdAt: item.createdAt || item.createTime,
      timeText: formatTimeAgo(item.createdAt || item.createTime),
    }));
  } catch (err) {
    console.error('加载待审批用户失败:', err);
    return [];
  }
}

/**
 * 加载租户内待审批的员工注册（租户主账号专用）
 * @returns {Promise<Array>} 待审批员工注册列表
 */
async function loadTenantPendingRegistrations() {
  try {
    const res = await api.tenant.listPendingRegistrations({ page: 1, pageSize: 10 });
    const list = res?.records || [];

    return list.map(item => ({
      id: item.id,
      name: item.name || item.username || '未知员工',
      phone: item.phone || '',
      username: item.username || '',
      createdAt: item.createdAt || item.createTime,
      timeText: formatTimeAgo(item.createdAt || item.createTime),
    }));
  } catch (err) {
    console.error('加载员工注册待审批失败:', err);
    return [];
  }
}

/**
 * 加载所有待处理任务（组合调用）
 * @param {Object} ctx - Component 实例
 * @returns {Promise<void>} 加载完成后更新组件数据
 */
async function loadAllTasks(ctx) {
  if (ctx.data.loading) {
    return;
  }

  ctx.setData({ loading: true });

  try {
    const isAdmin = checkIsAdmin();
    const canManageRegistrations = checkCanManageRegistrations();
    ctx.setData({ isAdmin, isTenantOwner: canManageRegistrations });

    const [cutting, procurement, quality, timeouts, pending, tenantRegistrations, overdueOrders] = await Promise.all([
      loadCuttingTasks(),
      loadProcurementTasks(),
      loadQualityTasks(),
      loadTimeoutReminders(),
      isAdmin ? loadPendingUsers() : Promise.resolve([]),
      canManageRegistrations ? loadTenantPendingRegistrations() : Promise.resolve([]),
      loadOverdueOrders(), // 加载延期订单
    ]);

    const urgentEvents = [];

    // 归纳延期订单统计
    const overdueSummary = summarizeOverdueOrders(overdueOrders);

    const totalCount =
      urgentEvents.length +
      cutting.length +
      procurement.length +
      quality.length +
      timeouts.length +
      pending.length +
      tenantRegistrations.length +
      overdueOrders.length; // 添加延期订单数量

    ctx.setData({
      urgentEvents,
      cuttingTasks: cutting,
      procurementTasks: procurement,
      qualityTasks: quality,
      timeoutReminders: timeouts,
      pendingUsers: pending,
      pendingRegistrations: tenantRegistrations,
      overdueOrders, // 延期订单列表
      overdueSummary, // 延期订单统计
      totalCount,
      hasAnyTask: totalCount > 0,
      loading: false,
    });
  } catch (err) {
    console.error('加载任务失败:', err);
    ctx.setData({ loading: false });
  }
}

module.exports = {
  formatTimeAgo,
  checkIsAdmin,
  checkIsTenantOwner,
  checkCanManageRegistrations,
  loadCuttingTasks,
  loadProcurementTasks,
  loadQualityTasks,
  loadTimeoutReminders,
  loadPendingUsers,
  loadTenantPendingRegistrations,
  loadAllTasks,
};
