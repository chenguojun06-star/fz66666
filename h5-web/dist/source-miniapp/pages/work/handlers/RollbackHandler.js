/**
 * 回退操作处理器
 * 从 work/index.js 提取，包含步骤回流和菲号回退两种操作
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { validateFields, validators } = require('../../../utils/validator');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const { normalizeText } = require('../utils/orderTransform');
const {
  stripWarehousingNode,
  resolveNodesFromOrder,
  getNodeIndexFromProgress,
  getProgressFromNodeIndex,
  clampPercent,
} = require('../utils/progressNodes');

// ==================== 步骤回流 ====================

/**
 * 打开步骤回流弹窗
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {Promise<void>} 加载完成后显示弹窗
 */
async function openStepRollback(ctx, e) {
  const orderId = normalizeText(
    e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id,
  );
  if (!orderId) {
    return;
  }
  const order = (ctx.data.orders.list || []).find(r => normalizeText(r && r.id) === orderId);
  if (!order) {
    toast.error('未找到订单');
    return;
  }

  let detail = null;
  try {
    detail = await api.production.orderDetail(orderId);
  } catch (e2) {
    detail = null;
  }

  const nodeSource = detail || order;
  const nodes = stripWarehousingNode(resolveNodesFromOrder(nodeSource));
  const progress = Number(nodeSource && nodeSource.productionProgress) || 0;
  const idx = getNodeIndexFromProgress(nodes, progress);
  if (idx <= 0) {
    toast.info('当前已是第一步');
    return;
  }
  const nextIdx = idx - 1;
  const nextProgress = getProgressFromNodeIndex(nodes, nextIdx);
  const nextProcessName = normalizeText(nodes[nextIdx] && nodes[nextIdx].name) || '上一步';

  ctx.setData({
    rollbackStep: {
      open: true,
      submitting: false,
      orderId,
      orderNo: normalizeText(order && order.orderNo),
      nextProcessName,
      nextProgress,
      remark: '',
    },
  });
}

/**
 * 回流备注输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRollbackStepRemarkInput(ctx, e) {
  ctx.setData({ 'rollbackStep.remark': (e && e.detail && e.detail.value) || '' });
}

/**
 * 关闭步骤回流弹窗
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function closeStepRollback(ctx) {
  ctx.setData({
    rollbackStep: {
      open: false,
      submitting: false,
      orderId: '',
      orderNo: '',
      nextProcessName: '',
      nextProgress: 0,
      remark: '',
    },
  });
}

/**
 * 提交步骤回流
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 回流完成后刷新列表
 */
async function submitStepRollback(ctx) {
  if (ctx.data.rollbackStep.submitting) {
    return;
  }
  const app = getApp();
  const orderId = normalizeText(ctx.data.rollbackStep.orderId);
  const remark = normalizeText(ctx.data.rollbackStep.remark);
  const nextProgress = clampPercent(Number(ctx.data.rollbackStep.nextProgress) || 0);
  const nextProcessName = normalizeText(ctx.data.rollbackStep.nextProcessName) || '上一步';

  if (!orderId) {
    return;
  }
  if (!remark) {
    toast.error('请填写问题点');
    return;
  }

  ctx.setData({ 'rollbackStep.submitting': true });
  try {
    await api.production.updateProgress({
      id: orderId,
      progress: nextProgress,
      rollbackRemark: remark,
      rollbackToProcessName: nextProcessName,
    });
    toast.success('回流成功');
    closeStepRollback(ctx);
    if (app && typeof app.resetPagedList === 'function') {
      app.resetPagedList(ctx, 'orders');
    }
    await ctx.loadOrders(true);
  } catch (e3) {
    if (e3 && e3.type === 'auth') {
      return;
    }
    if (app && typeof app.toastError === 'function') {
      app.toastError(e3, '回流失败');
    } else {
      toast.error('回流失败');
    }
  } finally {
    ctx.setData({ 'rollbackStep.submitting': false });
  }
}

// ==================== 菲号回退 ====================

/**
 * 切换菲号回退面板显示/隐藏
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function toggleRollback(ctx) {
  ctx.setData({ 'rollback.open': !ctx.data.rollback.open });
}

/**
 * 回退订单ID输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRollbackOrderIdInput(ctx, e) {
  ctx.setData({ 'rollback.orderId': (e && e.detail && e.detail.value) || '' });
}

/**
 * 回退二维码输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRollbackQrInput(ctx, e) {
  ctx.setData({ 'rollback.cuttingBundleQrCode': (e && e.detail && e.detail.value) || '' });
}

/**
 * 回退数量输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRollbackQtyInput(ctx, e) {
  const v = Number((e && e.detail && e.detail.value) || 1);
  const n = Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
  ctx.setData({ 'rollback.rollbackQuantity': n });
}

/**
 * 回退备注输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRollbackRemarkInput(ctx, e) {
  ctx.setData({ 'rollback.rollbackRemark': (e && e.detail && e.detail.value) || '' });
}

/**
 * 扫码获取回退二维码
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onScanRollbackQr(ctx) {
  wx.scanCode({
    onlyFromCamera: true,
    success: res => {
      const qr = res && res.result !== null ? String(res.result).trim() : '';
      if (!qr) {
        return;
      }
      ctx.setData({ 'rollback.cuttingBundleQrCode': qr });
    },
  });
}

/**
 * 验证回退表单数据
 * @param {string} cuttingBundleQrCode - 菲号二维码
 * @param {number} qty - 回退数量
 * @param {string} rollbackRemark - 回退备注
 * @returns {boolean} 验证是否通过
 * @private
 */
function _validateRollbackForm(cuttingBundleQrCode, qty, rollbackRemark) {
  return validateFields([
    { value: cuttingBundleQrCode, message: '请扫码扎号二维码' },
    { value: qty, message: '请输入回退数量', validator: validators.positive },
    { value: rollbackRemark, message: '请填写问题点' },
  ]);
}

/**
 * 刷新相关列表
 * @param {Object} ctx - Page 上下文
 * @param {string} orderId - 订单ID
 * @param {string} bundleNo - 菲号
 * @returns {Promise<void>} 刷新完成
 * @private
 */
async function _refreshAfterRollback(ctx, orderId, bundleNo) {
  if (ctx.data.activeTab === 'warehousing') {
    const app2 = getApp();
    if (app2 && typeof app2.resetPagedList === 'function') {
      app2.resetPagedList(ctx, 'warehousing');
    }
    await ctx.loadWarehousing(true);
  }

  const app = getApp();
  if (app && typeof app.resetPagedList === 'function') {
    app.resetPagedList(ctx, 'orders');
  }
  await ctx.loadOrders(true);

  triggerDataRefresh('orders', {
    action: 'rollback',
    orderId: orderId,
    bundleNo: bundleNo,
  });
}

/**
 * 提交菲号回退
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 回退完成后刷新列表
 */
async function submitRollback(ctx) {
  if (ctx.data.rollback.submitting) {
    return;
  }
  const app = getApp();
  const orderId = normalizeText(ctx.data.rollback.orderId);
  const cuttingBundleQrCode = normalizeText(ctx.data.rollback.cuttingBundleQrCode);
  const qty = Number(ctx.data.rollback.rollbackQuantity) || 0;
  const rollbackRemark = normalizeText(ctx.data.rollback.rollbackRemark);

  if (!_validateRollbackForm(cuttingBundleQrCode, qty, rollbackRemark)) {
    return;
  }

  ctx.setData({ 'rollback.submitting': true });
  try {
    await api.production.rollbackByBundle({
      orderId: orderId || undefined,
      cuttingBundleQrCode,
      rollbackQuantity: qty,
      rollbackRemark: rollbackRemark || undefined,
    });
    toast.success('回退成功');

    ctx.setData({
      rollback: {
        ...ctx.data.rollback,
        submitting: false,
        open: false,
        orderId: '',
        cuttingBundleQrCode: '',
        rollbackQuantity: 1,
        rollbackRemark: '',
      },
    });

    await _refreshAfterRollback(ctx, orderId, cuttingBundleQrCode);
  } catch (e) {
    if (e && e.type === 'auth') {
      return;
    }
    if (app && typeof app.toastError === 'function') {
      app.toastError(e, '回退失败');
    } else {
      toast.error('回退失败');
    }
  } finally {
    ctx.setData({ 'rollback.submitting': false });
  }
}

module.exports = {
  // 步骤回流
  openStepRollback,
  onRollbackStepRemarkInput,
  closeStepRollback,
  submitStepRollback,
  // 菲号回退
  toggleRollback,
  onRollbackOrderIdInput,
  onRollbackQrInput,
  onRollbackQtyInput,
  onRollbackRemarkInput,
  onScanRollbackQr,
  submitRollback,
};
