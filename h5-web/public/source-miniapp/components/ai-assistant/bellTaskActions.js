/**
 * 铃铛组件 - 任务操作模块
 * 从 floating-bell/index.js 提取，负责各类任务的点击跳转和审批操作
 */
const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');

/**
 * 处理裁剪任务 - 跳转裁剪任务页
 * D-306：有 orderNo/orderId 即带参直达（bundle-detail 实际按 orderNo 加载，taskId 非必需）——
 * 原实现要求 taskId&&orderNo 才带参，缺 taskId 时落到无参页显示订单列表，用户还要再找一遍
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleCuttingTask(task) {
  const orderNo = task.productionOrderNo || task.orderNo || '';
  const taskId = task.id || task.taskId || '';
  const orderId = task.orderId || task.productionOrderId || '';

  if (orderNo || orderId) {
    const url = `/pages/cutting/bundle-detail/index?taskId=${encodeURIComponent(taskId)}&orderNo=${encodeURIComponent(orderNo)}&orderId=${encodeURIComponent(orderId)}`;
    safeNavigate({ url }, 'navigateTo').catch(() => {});
  } else {
    safeNavigate({ url: '/pages/cutting/bundle-detail/index' }, 'navigateTo').catch(() => {});
  }
}

/**
 * 处理采购任务 - 跳转采购详情页
 * 支持大货订单（orderNo）和样衣采购（patternProductionId）
 * @param {Object} task - 任务对象
 * @returns {void}
 */
function handleProcurementTask(task) {
  const orderNo = task.orderNo || '';
  const styleNo = task.styleNo || '';
  const patternProductionId = task.patternProductionId || '';
  const sourceType = task.sourceType || (patternProductionId ? 'sample' : '');

  // 优先用 orderNo（大货），其次用 patternProductionId（样衣采购）
  if (orderNo) {
    const url = `/pages/procurement/task-detail/index?orderNo=${encodeURIComponent(orderNo)}&styleNo=${encodeURIComponent(styleNo)}&sourceType=${encodeURIComponent(sourceType)}`;
    safeNavigate({ url }, 'navigateTo').catch(() => {});
  } else if (patternProductionId) {
    const url = `/pages/procurement/task-detail/index?patternProductionId=${encodeURIComponent(patternProductionId)}&styleNo=${encodeURIComponent(styleNo)}&sourceType=${encodeURIComponent(sourceType)}`;
    safeNavigate({ url }, 'navigateTo').catch(() => {});
  } else {
    // D-306：无单号也无样衣ID的样衣任务，带款号作关键词直达列表并预置搜索，不让用户进列表再手打
    const kw = encodeURIComponent(styleNo || task.materialName || task.materialCode || '');
    safeNavigate({ url: '/pages/procurement/task-list/index' + (kw ? '?keyword=' + kw : '') }, 'navigateTo').catch(() => {});
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
    return;
  }

  // switchTab 后主动触发弹窗，不依赖 onShow 的 checkLoginStatus 是否成功
  // （checkLoginStatus 失败或 switchTab 到已激活 tab 时 onShow 可能不再调用 checkPendingTasks）
  const invokeAfterNavigate = () => {
    const newPages = getCurrentPages();
    const newPage = newPages[newPages.length - 1];
    if (newPage && typeof newPage.checkPendingQualityTask === 'function') {
      newPage.checkPendingQualityTask();
    }
  };

  safeNavigate({ url: '/pages/scan/index' }, 'switchTab')
    .then(() => {
      // 等待扫码页 onShow/onLoad 中的 mixin 挂载完成（约 200ms）
      setTimeout(invokeAfterNavigate, 200);
    })
    .catch(() => {
      // 导航失败时也尝试直接触发（兜底，防止存储残留）
      invokeAfterNavigate();
    });
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
  // 立即跳转，不再延迟 800ms（toast 会在跳转后继续显示）
  safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
}

/**
 * 处理审批任务 - 跳转审批页面
 * @param {Object} _task - 任务对象（保留用于未来扩展）
 * @returns {void} 无返回值
 */
function handleApprovalTask(_task) { // eslint-disable-line no-unused-vars
  safeNavigate({ url: '/pages/admin/user-approval/index' }).catch(() => {});
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

  // 采购提醒 → 直达采购详情页（支持大货和样衣）
  if (type === '采购') {
    handleProcurementTask(task);
    return;
  }

  // 裁剪提醒 → 与裁剪任务同逻辑直达（有 orderNo 即带参，不再落无参订单列表）
  if (type === '裁剪') {
    handleCuttingTask(task);
    return;
  }

  // 其他提醒类型 → 直接跳转扫码页，扫码页 onShow 自动读取 pending_order_hint
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
 * 处理延期订单 - 直达该订单详情页（D-306 用户拍板：不再落生产管理列表定位）
 * @param {Object} task - 延期订单对象
 * @returns {void}
 */
function handleOverdueOrder(task) {
  const orderNo = task.orderNo || '';
  const orderId = task.id || '';

  if (orderId || orderNo) {
    const params = [];
    if (orderId) params.push('orderId=' + encodeURIComponent(orderId));
    if (orderNo) params.push('orderNo=' + encodeURIComponent(orderNo));
    safeNavigate({ url: '/pages/dashboard/order-detail/index?' + params.join('&') }, 'navigateTo').catch(() => {});
  } else {
    safeNavigate({ url: '/pages/smart-ops/index' }, 'navigateTo').catch(() => {});
  }
}

/**
 * D-309 处理外发发货/收货通知 - 直达发货详情（收货确认/发货记录页签）
 * @param {Object} task - 通知对象
 * @returns {void}
 */
function handleShipmentTask(task) {
  const orderId = task.orderId || '';
  const orderNo = task.orderNo || '';
  if (!orderId && !orderNo) {
    safeNavigate({ url: '/pages/factory/shipment/index' }, 'navigateTo').catch(() => {});
    return;
  }
  const params = [];
  if (orderId) params.push('orderId=' + encodeURIComponent(orderId));
  if (orderNo) params.push('orderNo=' + encodeURIComponent(orderNo));
  safeNavigate({ url: '/pages/factory/shipment-detail/index?' + params.join('&') + '&tab=records' }, 'navigateTo').catch(() => {});
}

/**
 * 处理样衣开发任务 - 跳转样衣开发首页（列表态，便于继续处理）
 * 注：统一接口下样衣待办按「环节」展开，暂无数值 styleId 可拼详情页，先落列表页
 * @param {Object} _task - 任务对象
 * @returns {void}
 */
function handleStyleDevTask(task) {
  // D-416：样衣开发待办可解析出 styleId，改为直达详情页（原仅落列表，用户还要再找一遍）
  //   id           = "STY_{styleId}_{stageKey}"
  //   deepLinkPath = "/style-info/{styleId}?tab={tabKey}"
  let styleId = '';
  const dl = String((task && task.deepLinkPath) || '');
  const m = dl.match(/\/style-info\/([^/?]+)/);
  if (m) styleId = decodeURIComponent(m[1]);
  if (!styleId && /^STY_/.test(String((task && task.id) || ''))) {
    styleId = String(task.id).replace(/^STY_/, '').replace(/_[^_]*$/, '');
  }
  if (styleId) {
    safeNavigate({ url: '/pages/sample-development/detail/index?styleId=' + encodeURIComponent(styleId) }, 'navigateTo').catch(() => {});
  } else {
    safeNavigate({ url: '/pages/sample-development/index/index' }, 'navigateTo').catch(() => {});
  }
}

/**
 * 缺口类型（手机端无独立业务处理页）→ 进入统一待办详情页（只读展示真实数据，布局清晰）
 * 待办数据先写入本地 storage（URL 长度有限，不拼进 query），详情页 onLoad 读取
 * @param {Object} task - 统一待办任务
 * @returns {void}
 */
function openUnifiedDetail(task) {
  try {
    wx.setStorageSync('pending_unified_task', JSON.stringify(task));
  } catch (e) {
    console.error('存储统一待办失败', e);
  }
  safeNavigate({ url: '/pages/todo-detail/index' }, 'navigateTo').catch(() => {});
}

/**
 * 统一业务待办点击路由：按 taskType 分发到对应落地页。
 * - 已有业务页的类型 → 复用既有处理逻辑
 * - 手机端无独立页的缺口类型 → 进统一待办详情页（只读展示，不自造写操作，避免数据异常）
 * @param {Object} task - 统一待办任务（bellTaskLoader.normalizeBusinessTask 产物）
 * @returns {void}
 */
function handleBusinessTask(task) {
  if (!task) return;
  switch (task.taskType) {
    case 'CUTTING_TASK': handleCuttingTask(task); break;
    case 'QUALITY_INSPECT': handleQualityTask(task); break;
    case 'REPAIR': handleRepairTask(task); break;
    case 'MATERIAL_PURCHASE': handleProcurementTask(task); break;
    case 'OVERDUE_ORDER':
      // 统一接口逾期项 id 带 "OVD_" 前缀，不能当真实 orderId 用；订单详情按 orderNo 直达
      if (task.orderNo) {
        safeNavigate({ url: '/pages/dashboard/order-detail/index?orderNo=' + encodeURIComponent(task.orderNo) }, 'navigateTo').catch(() => {});
      } else {
        handleOverdueOrder(task);
      }
      break;
    case 'SHIPMENT': handleShipmentTask(task); break;
    case 'STYLE_DEVELOPMENT': handleStyleDevTask(task); break;
    // 缺口类型：点击直达最近真实业务页（与 PC 一致，不中转包装页）
    // 只读展示逻辑已由后端按租户+角色过滤，这里仅做页面直达
    case 'PAYROLL_SETTLEMENT': {
      // D-430：待办 id = "PAY_{settlementId}"（见 PendingTaskOrchestrator.collectPayrollSettlementTasks）
      // 带上 settlementId 让列表页精确筛出该结算单的明细；若只有一条明细，
      // 列表页会自动直达详情页（用户要求"点击直达详情页，不要停在列表"）。
      var paySid = String(task.id || '').replace(/^PAY_/, '');
      var payParams = [];
      if (paySid) payParams.push('settlementId=' + encodeURIComponent(paySid));
      if (task.orderNo) payParams.push('orderNo=' + encodeURIComponent(task.orderNo));
      safeNavigate({
        url: '/pages/finance/payroll-approval/index' + (payParams.length ? '?' + payParams.join('&') : ''),
      }, 'navigateTo').catch(() => {});
      break;
    }
    case 'MATERIAL_RECON': {
      // D-430：待办 id = "MRC_{reconciliationId}"，同上——带 id 精确筛选 + 单条自动直达详情
      var mrcId = String(task.id || '').replace(/^MRC_/, '');
      var mrcParams = [];
      if (mrcId) mrcParams.push('reconciliationId=' + encodeURIComponent(mrcId));
      if (task.orderNo) mrcParams.push('orderNo=' + encodeURIComponent(task.orderNo));
      safeNavigate({
        url: '/pages/finance/reconciliation/index' + (mrcParams.length ? '?' + mrcParams.join('&') : ''),
      }, 'navigateTo').catch(() => {});
      break;
    }
    case 'EXPENSE_REIMBURSE':
      // D-416：直达费用报销审批页（此前与对账共用付款页）
      safeNavigate({ url: '/pages/finance/reimbursement/index?status=pending' }, 'navigateTo').catch(() => {});
      break;
    case 'EXCEPTION_REPORT':
      // D-416：异常报告已建独立处理页（标记已解决/重新打开）。
      // 带单号时预置筛选，直达待处理列表；无单号则看全部待处理。
      safeNavigate({
        url: '/pages/smart-ops/exception-detail/index?status=PENDING'
          + (task.orderNo ? '&keyword=' + encodeURIComponent(task.orderNo) : ''),
      }, 'navigateTo').catch(() => {});
      break;
    case 'SAMPLE_LOAN':
      safeNavigate({ url: '/pages/warehouse/sample/scan-action/index' }, 'navigateTo').catch(() => {});
      break;
    case 'MATERIAL_PICKING':
      safeNavigate({ url: '/pages/warehouse/material/scan/index' }, 'navigateTo').catch(() => {});
      break;
    case 'COLLAB_TASK':
      // D-416：协作任务已建独立处理页（领取/开始/完成）。待办 id = "COLLAB_{taskId}"，
      // deepLinkPath = "xiaoyun://tasks?taskId={id}"，两种方式都可解析出 taskId
      var collabId = '';
      var dlMatch = String(task.deepLinkPath || '').match(/taskId=(\d+)/);
      if (dlMatch) collabId = dlMatch[1];
      if (!collabId) {
        var idMatch = String(task.id || '').match(/^COLLAB_(\d+)/);
        if (idMatch) collabId = idMatch[1];
      }
      if (collabId) {
        safeNavigate({ url: '/pages/collab-task/detail/index?taskId=' + encodeURIComponent(collabId) }, 'navigateTo').catch(() => {});
      } else {
        // 解析不出 taskId 时兜底到统一待办详情页，避免白屏
        openUnifiedDetail(task);
      }
      break;
    default:
      // 未识别类型 → 统一待办详情页（只读展示，不自造写操作）
      openUnifiedDetail(task); break;
  }
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
    case 'shipment':
      handleShipmentTask(task);
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
  handleStyleDevTask,
  handleBusinessTask,
  onApproveUser,
  onApproveRegistration,
  handleReminderTask,
  handleUrgentEvent,
  handleOverdueOrder,
  onTaskClick,
};
