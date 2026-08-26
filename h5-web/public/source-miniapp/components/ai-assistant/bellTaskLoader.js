/**
 * 铃铛组件 - 任务加载模块
 * 从 floating-bell/index.js 提取，负责各类任务的数据加载
 */
const api = require('../../utils/api');
const reminderManager = require('../../utils/reminderManager');
const storage = require('../../utils/storage');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
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
  // iOS 不支持 "yyyy-MM-dd HH:mm:ss" 空格格式，需将空格替换为 T 兼容 ISO 8601
  const normalized = typeof time === 'string' ? time.replace(' ', 'T') : time;
  const date = new Date(normalized);
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
    // 租户主账号拥有管理员权限
    if (userInfo.isTenantOwner === true) {
      return true;
    }
    const role = String(userInfo.role || userInfo.roleCode || '').toLowerCase();
    return ['admin', 'supervisor', 'super_admin', 'manager', 'tenant_admin', 'tenant_manager'].includes(role);
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
      // 保留款式图字段（后端 CuttingTaskOrchestrator.getMyTasks 已注入 styleCover）
      // 需经 getAuthedImageUrl 处理：相对路径拼接 + token 鉴权
      coverImage: getAuthedImageUrl(item.coverImage || item.styleImage || item.styleCover || ''),
      receivedTimeText: formatTimeAgo(item.receivedTime),
    }));
  } catch (err) {
    console.error('加载裁剪任务失败:', err);
    return [];
  }
}

/**
 * 加载采购任务（已领取待完成）— 按款聚合
 * 一个款（按 orderNo 或 patternProductionId）只显示一条
 * 点击后跳转到详情页查看具体物料
 * @returns {Promise<Array>} 采购任务列表（款式级别）
 */
async function loadProcurementTasks() {
  try {
    // 待办语义：只要待领取 + 我已领取未完成的任务（不含已完成/已取消）
    const res = await api.production.myProcurementTasks(false);
    const rawList = Array.isArray(res) ? res : res?.records || [];

    // 客户端兜底过滤（双路径防御）：后端已过滤终态，此处再排除
    // 1) status 为 completed/cancelled 的行
    // 2) 到货数 >= 采购数的行（数量维度已完成）
    const list = rawList.filter(item => {
      const status = String(item.status || '').toLowerCase();
      if (status === 'completed' || status === 'cancelled') return false;
      const purchased = Number(item.purchaseQuantity) || 0;
      const arrived = Number(item.arrivedQuantity) || 0;
      if (purchased > 0 && arrived >= purchased) return false;
      return true;
    });

    // 1. 物料级别规范化
    const mapped = list.map(item => ({
      ...item,
      id: item.id || item.purchaseId,
      orderNo: item.orderNo || item.productionOrderNo || '',
      styleNo: item.styleNo || '',
      materialName: item.materialName || '未知物料',
      purchaseQuantity: Number(item.purchaseQuantity) || 0,
      arrivedQuantity: Number(item.arrivedQuantity) || 0,
      unit: item.unit || '米',
      patternProductionId: item.patternProductionId || '',
      sourceType: item.sourceType || '',
      coverImage: getAuthedImageUrl(item.coverImage || item.styleImage || item.styleCover || ''),
      receivedTime: item.receivedTime,
    }));

    // 2. 按款聚合：大货按 orderNo，样衣按 patternProductionId
    const groupMap = {};
    const order = [];
    mapped.forEach(item => {
      const groupKey = item.patternProductionId
        ? 'sample::' + item.patternProductionId
        : 'order::' + (item.orderNo || item.id || 'unknown');

      if (!groupMap[groupKey]) {
        groupMap[groupKey] = {
          id: groupKey,  // dismiss 用 groupKey
          groupKey,
          orderNo: item.orderNo || '',
          styleNo: item.styleNo || '',
          styleName: item.styleName || '',
          patternProductionId: item.patternProductionId || '',
          sourceType: item.sourceType || (item.patternProductionId ? 'sample' : ''),
          coverImage: item.coverImage || '',
          items: [],
          _latestReceivedTime: null,
        };
        order.push(groupKey);
      }
      groupMap[groupKey].items.push(item);
      // 取最新的领取时间
      if (item.receivedTime) {
        const t = new Date(item.receivedTime).getTime();
        if (!isNaN(t) && (!groupMap[groupKey]._latestReceivedTime || t > groupMap[groupKey]._latestReceivedTime)) {
          groupMap[groupKey]._latestReceivedTime = t;
        }
      }
    });

    // 3. 构建款式级别卡片
    return order.map(key => {
      const g = groupMap[key];
      const items = g.items;
      const materialCount = items.length;
      const totalQuantity = items.reduce((s, it) => s + it.purchaseQuantity, 0);
      const totalArrived = items.reduce((s, it) => s + it.arrivedQuantity, 0);
      const unit = items[0] && items[0].unit ? items[0].unit : '';
      const receivedTimeText = g._latestReceivedTime ? formatTimeAgo(new Date(g._latestReceivedTime).toISOString()) : '';

      return {
        id: g.id,
        groupKey: g.groupKey,
        orderNo: g.orderNo,
        styleNo: g.styleNo,
        styleName: g.styleName,
        patternProductionId: g.patternProductionId,
        sourceType: g.sourceType,
        coverImage: g.coverImage,
        // 展示用字段
        materialCount,
        purchaseQuantity: totalQuantity,
        arrivedQuantity: totalArrived,
        unit,
        // 用于 wxml 兼容：显示款号或物料数量
        materialName: materialCount > 1
          ? materialCount + '项物料'
          : (items[0].materialName || '待采购物料'),
        receivedTimeText,
        quantityText: unit ? totalQuantity + unit : String(totalQuantity),
        arrivalText: totalArrived > 0 ? totalArrived + '/' + totalQuantity : '',
      };
    });
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
      // 保留款式图字段（后端 ScanRecordController.my-quality-tasks 已注入 coverImage/styleImage）
      // 需经 getAuthedImageUrl 处理：相对路径拼接 + token 鉴权
      coverImage: getAuthedImageUrl(item.coverImage || item.styleImage || item.styleCover || ''),
      receivedTimeText: formatTimeAgo(item.scanTime || item.createdAt),
    }));
  } catch (err) {
    console.error('加载质检任务失败:', err);
    return [];
  }
}

/**
 * 加载次品待返修任务（status=unqualified 的菲号）
 * @returns {Promise<Array>} 返修任务列表
 */
async function loadRepairTasks() {
  try {
    const res = await api.production.myRepairTasks();
    const list = Array.isArray(res) ? res : (res && Array.isArray(res.records) ? res.records : []);
    return list.map(item => ({
      ...item,
      id: item.bundleId || item.id,
      orderNo: item.orderNo || '',
      styleNo: item.styleNo || '',
      bundleNo: item.bundleNo || '',
      qrCode: item.qrCode || '',
      color: item.color || '',
      size: item.size || '',
      defectQty: Number(item.defectQty) || 0,
      defectCategory: item.defectCategory || '',
      // 保留款式图字段，需经 getAuthedImageUrl 处理：相对路径拼接 + token 鉴权
      coverImage: getAuthedImageUrl(item.coverImage || item.styleImage || item.styleCover || ''),
    }));
  } catch (err) {
    console.error('[loadRepairTasks] 加载失败:', err);
    return [];
  }
}

/**
 * 加载超时提醒（从本地 reminderManager）
 * @returns {Array} 超时提醒列表
 */
function loadTimeoutReminders() {
  try {
    // 主动清理过期数据：addReminder() 在当前代码中未被调用，
    // localStorage 里可能有旧版本遗留的历史积累数据，先清掉再读
    reminderManager.cleanupExpiredReminders();

    const allReminders = reminderManager.getReminders();
    const now = Date.now();
    const REMINDER_INTERVAL = 10 * 60 * 60 * 1000; // 10小时
    const MAX_REMINDER_AGE = 7 * 24 * 60 * 60 * 1000; // 7天：与 cleanupExpiredReminders 阈值对齐

    const pendingReminders = allReminders.filter(r => {
      const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
      if (baseTime <= 0) return false;
      // 超过7天的旧提醒不再显示（与 cleanupExpiredReminders 阈值对齐）
      if (now - Number(r.createdAt || baseTime) > MAX_REMINDER_AGE) return false;
      return now - baseTime >= REMINDER_INTERVAL;
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
  if (!ctx || !ctx.data || ctx.data.loading) {
    return;
  }

  ctx.setData({ loading: true });

  try {
    const isAdmin = checkIsAdmin();
    const canManageRegistrations = checkCanManageRegistrations();
    const isSuperAdmin = isAdmin && !canManageRegistrations;
    ctx.setData({ isAdmin, isTenantOwner: canManageRegistrations });

    const [cutting, procurement, quality, repair, timeouts, pending, tenantRegistrations, overdueOrders] = await Promise.all([
      loadCuttingTasks(),
      isAdmin ? loadProcurementTasks() : Promise.resolve([]),
      loadQualityTasks(),
      loadRepairTasks(),
      isAdmin ? loadTimeoutReminders() : Promise.resolve([]),
      isSuperAdmin ? loadPendingUsers() : Promise.resolve([]),
      canManageRegistrations ? loadTenantPendingRegistrations() : Promise.resolve([]),
      isAdmin ? loadOverdueOrders() : Promise.resolve([]),
    ]);

    const urgentEvents = [];

    // 归纳延期订单统计
    const overdueSummary = summarizeOverdueOrders(overdueOrders);

    const totalCount =
      urgentEvents.length +
      cutting.length +
      procurement.length +
      quality.length +
      repair.length +
      timeouts.length +
      pending.length +
      tenantRegistrations.length +
      overdueOrders.length;

    ctx.setData({
      urgentEvents,
      cuttingTasks: cutting,
      procurementTasks: procurement,
      qualityTasks: quality,
      repairTasks: repair,       // 次品待返修列表
      timeoutReminders: timeouts,
      pendingUsers: pending,
      pendingRegistrations: tenantRegistrations,
      overdueOrders,
      overdueSummary,
      totalCount,
      hasAnyTask: totalCount > 0,
      loading: false,
    });
  } catch (err) {
    console.error('加载任务失败:', err);
    if (ctx) ctx.setData({ loading: false });
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
  loadRepairTasks,
  loadTimeoutReminders,
  loadPendingUsers,
  loadTenantPendingRegistrations,
  loadAllTasks,
};
