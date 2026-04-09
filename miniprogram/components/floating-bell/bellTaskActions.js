/**
 * 铃铛组件 - 任务操作模块
 * 从 floating-bell/index.js 提取，负责各类任务的点击跳转和审批操作
 */
const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');

/**
 * 处理裁剪任务 - 跳转裁剪任务页
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleCuttingTask(task) {
  const orderNo = task.productionOrderNo || task.orderNo || '';
  const taskId = task.id || task.taskId || '';
  const orderId = task.orderId || task.productionOrderId || '';

  if (taskId && orderNo) {
    const url = `/pages/cutting/task-detail/index?taskId=${taskId}&orderNo=${encodeURIComponent(orderNo)}&orderId=${encodeURIComponent(orderId)}`;
    safeNavigate({ url }, 'navigateTo').catch(() => {});
  } else {
    safeNavigate({ url: '/pages/cutting/task-list/index' }, 'navigateTo').catch(() => {});
  }
}

/**
 * 处理采购任务 - 跳转采购任务页
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleProcurementTask(task) {
  const orderNo = task.orderNo || '';
  const styleNo = task.styleNo || '';

  if (orderNo) {
    const url = `/pages/procurement/task-detail/index?orderNo=${encodeURIComponent(orderNo)}&styleNo=${encodeURIComponent(styleNo)}`;
    safeNavigate({ url }, 'navigateTo').catch(() => {});
  } else {
    safeNavigate({ url: '/pages/work/index' }, 'switchTab').catch(() => {});
  }
}

/**
 * 处理质检任务 - 跳转扫码页并弹出质检弹窗
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleQualityTask(task) {
  try {
    wx.setStorageSync('pending_quality_task', JSON.stringify(task));
    wx.setStorageSync('pending_order_hint', task.orderNo || '');
  } catch (e) {
    console.error('存储失败', e);
  }

  // 若当前已在扫码页（同一 tab），wx.switchTab 不会重新触发 onShow，
  // 直接调用页面实例的 checkPendingQualityTask 确保弹窗弹出
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && typeof currentPage.checkPendingQualityTask === 'function') {
    currentPage.checkPendingQualityTask();
  } else {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  }
}

/**
 * 处理次品返修任务 - 提示工人修好后去扫码页扫码申报
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleRepairTask(task) {
  const orderNo = task.orderNo || '';
  const bundleNo = task.bundleNo ? String(task.bundleNo) : '';
  const hint = bundleNo ? `订单${orderNo} 菲号${bundleNo}修好后请扫码申报` : `订单${orderNo} 次品修好后请扫码申报`;
  try {
    wx.setStorageSync('pending_repair_task', JSON.stringify(task));
    wx.setStorageSync('pending_order_hint', orderNo);
  } catch (e) {
    console.error('存储失败', e);
  }
  wx.showToast({ title: hint, icon: 'none', duration: 2500 });
  setTimeout(() => {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  }, 800);
}

/**
 * 处理审批任务 - 跳转审批页面
 * @param {Object} _task - 任务对象（保留用于未来扩展）
 * @returns {void} 无返回值
 */
function handleApprovalTask(_task) { // eslint-disable-line no-unused-vars
  safeNavigate({ url: '/pages/admin/notification/index' }).catch(() => {});
}

/**
 * 直接审批用户（通过/拒绝）
 * @param {Object} ctx - Component 实例
 * @param {Object} e - 事件对象
 * @returns {Promise<void>} 无返回值
 */
async function onApproveUser(ctx, e) {
  const { userId, action } = e.currentTarget.dataset;
  if (!userId) {
    return;
  }

  const isApprove = action === 'approve';
  const actionText = isApprove ? '通过' : '拒绝';

  const confirmRes = await new Promise(resolve => {
    wx.showModal({
      title: '确认操作',
      content: `确定要${actionText}该用户的注册申请吗？`,
      success: res => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });

  if (!confirmRes) {
    return;
  }

  wx.showLoading({ title: '处理中...', mask: true });

  try {
    if (isApprove) {
      await api.system.approveUser(userId);
    } else {
      await api.system.rejectUser(userId);
    }

    wx.showToast({ title: `${actionText}成功`, icon: 'success' });
    ctx.loadTasks();
  } catch (err) {
    console.error('审批失败:', err);
    wx.showToast({ title: err.message || '操作失败', icon: 'none' });
  } finally {
    wx.hideLoading();
  }
}

/**
 * 直接审批员工注册（租户主账号）
 * @param {Object} ctx - Component 实例
 * @param {Object} e - 事件对象
 * @returns {Promise<void>} 无返回值
 */
async function onApproveRegistration(ctx, e) {
  const { userId, action } = e.currentTarget.dataset;
  if (!userId) {
    return;
  }

  const isApprove = action === 'approve';
  const actionText = isApprove ? '通过' : '拒绝';

  const confirmRes = await new Promise(resolve => {
    wx.showModal({
      title: '确认操作',
      content: `确定要${actionText}该员工的注册申请吗？`,
      success: res => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });

  if (!confirmRes) {
    return;
  }

  wx.showLoading({ title: '处理中...', mask: true });

  try {
    if (isApprove) {
      await api.tenant.approveRegistration(userId);
    } else {
      await api.tenant.rejectRegistration(userId);
    }

    wx.showToast({ title: `${actionText}成功`, icon: 'success' });
    ctx.loadTasks();
  } catch (err) {
    console.error('审批员工注册失败:', err);
    wx.showToast({ title: err.message || '操作失败', icon: 'none' });
  } finally {
    wx.hideLoading();
  }
}

/**
 * 处理超时提醒
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleReminderTask(task) {
  const orderNo = task.orderNo || '';
  const type = task.type || '';

  // 采购提醒 → 跳转工作台（采购任务列表页已移除）
  if (type === '采购') {
    safeNavigate({ url: '/pages/work/index' }, 'switchTab').catch(() => {});
    return;
  }

  // 裁剪提醒 → 跳转裁剪任务列表页
  if (type === '裁剪') {
    safeNavigate({ url: '/pages/cutting/task-list/index' }, 'navigateTo').catch(() => {});
    return;
  }

  // 其他提醒类型 → 保持原有扫码页跳转
  try {
    wx.setStorageSync('pending_order_hint', orderNo);
  } catch (e) {
    console.error('存储失败', e);
  }
  safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
}

/**
 * 处理紧急事件
 * @param {Object} _task - 任务对象（保留用于未来扩展）
 * @returns {void} 无返回值
 */
function handleUrgentEvent(_task) { // eslint-disable-line no-unused-vars
  safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
}

/**
 * 处理延期订单 - 跳转到工作页面并定位该订单
 * @param {Object} task - 延期订单对象
 * @returns {void}
 */
function handleOverdueOrder(task) {
  const orderNo = task.orderNo || '';
  try {
    // 存储订单提示
    wx.setStorageSync('pending_order_hint', orderNo);
    // 存储延期订单信息，用于高亮显示
    wx.setStorageSync('highlight_order_no', orderNo);
  } catch (e) {
    console.error('存储失败', e);
  }

  // 跳转到工作页面
  safeNavigate({ url: '/pages/work/index' }, 'switchTab').catch(() => {});
}

/**
 * 统一任务点击路由
 * @param {Object} ctx - Component 实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onTaskClick(ctx, e) {
  const { task, type } = e.currentTarget.dataset;
  if (!task) {
    return;
  }

  ctx.closePanel();
  ctx.triggerEvent('taskclick', { task, type });

  switch (type) {
    case 'cutting':
      handleCuttingTask(task);
      break;
    case 'procurement':
      handleProcurementTask(task);
      break;
    case 'quality':
      handleQualityTask(task);
      break;
    case 'approval':
      handleApprovalTask(task);
      break;
    case 'registration':
      safeNavigate({ url: '/pages/admin/user-approval/index' }).catch(() => {});
      break;
    case 'reminder':
      handleReminderTask(task);
      break;
    case 'urgent':
      handleUrgentEvent(task);
      break;
    case 'overdue':
      handleOverdueOrder(task);
      break;
    case 'repair':
      handleRepairTask(task);
      break;
    default:
      break;
  }
}

module.exports = {
  handleCuttingTask,
  handleProcurementTask,
  handleQualityTask,
  handleRepairTask,
  handleApprovalTask,
  onApproveUser,
  onApproveRegistration,
  handleReminderTask,
  handleUrgentEvent,
  handleOverdueOrder,
  onTaskClick,
};
