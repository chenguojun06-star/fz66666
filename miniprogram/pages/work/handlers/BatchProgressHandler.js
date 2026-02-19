/**
 * 批量进度更新操作
 * 从 work/index.js 提取，处理批量进度更新相关交互
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { validateFields, validators } = require('../../../utils/validator');
const { normalizeText } = require('../utils/orderTransform');
const { clampPercent } = require('../utils/progressNodes');

/**
 * 切换批量进度面板显示/隐藏
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function toggleBatchProgress(ctx) {
  ctx.setData({ 'batchProgress.open': !ctx.data.batchProgress.open });
}

/**
 * 批量选择订单变更
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onBatchSelectChange(ctx, e) {
  const ids = e && e.detail && Array.isArray(e.detail.value) ? e.detail.value : [];
  ctx.setData({
    'batchProgress.selectedIds': ids.map(v => String(v || '').trim()).filter(Boolean),
  });
}

/**
 * 批量进度输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onBatchProgressInput(ctx, e) {
  ctx.setData({ 'batchProgress.progress': (e && e.detail && e.detail.value) || '' });
}

/**
 * 批量进度备注输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onBatchProgressRemarkInput(ctx, e) {
  ctx.setData({ 'batchProgress.remark': (e && e.detail && e.detail.value) || '' });
}

/**
 * 清空批量选择
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function clearBatchSelection(ctx) {
  ctx.setData({ 'batchProgress.selectedIds': [] });
}

/**
 * 执行批量进度更新请求
 * @param {Array} selectedOrders - 选中的订单列表
 * @param {number} targetProgress - 目标进度
 * @param {string|undefined} remark - 备注
 * @returns {Promise<Object>} 执行结果 { success, failed }
 * @private
 */
async function _executeBatchUpdate(selectedOrders, targetProgress, remark) {
  const settled = await Promise.allSettled(
    selectedOrders.map(o =>
      api.production.updateProgress({
        id: normalizeText(o && o.id),
        progress: targetProgress,
        rollbackRemark: remark,
      }),
    ),
  );
  const success = settled.filter(s => s.status === 'fulfilled').length;
  const failed = settled.length - success;
  return { success, failed };
}

/**
 * 验证并准备批量更新参数
 * @param {Object} ctx - Page 上下文
 * @returns {Object|null} 参数对象或null（验证失败）
 * @private
 */
function _prepareBatchParams(ctx) {
  const ids = Array.isArray(ctx.data.batchProgress.selectedIds)
    ? ctx.data.batchProgress.selectedIds
    : [];
  const progressInput = Number(ctx.data.batchProgress.progress);
  const remark = normalizeText(ctx.data.batchProgress.remark);

  const valid = validateFields([
    { value: ids.length, message: '请选择订单' },
    { value: progressInput, message: '请输入进度', validator: validators.nonNegative },
  ]);
  if (!valid) {
    return null;
  }

  const targetProgress = clampPercent(progressInput);
  const list = Array.isArray(ctx.data.orders.list) ? ctx.data.orders.list : [];
  const selectedOrders = list.filter(o => ids.includes(normalizeText(o && o.id)));
  const needRemark = selectedOrders.some(
    o => (Number(o && o.productionProgress) || 0) > targetProgress,
  );

  if (needRemark && !remark) {
    toast.error('请填写问题点');
    return null;
  }

  return { selectedOrders, targetProgress, remark: needRemark ? remark : undefined };
}

/**
 * 提交批量进度更新
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 提交完成后刷新列表
 */
async function submitBatchProgress(ctx) {
  if (ctx.data.batchProgress.submitting) {
    return;
  }

  const params = _prepareBatchParams(ctx);
  if (!params) {
    return;
  }

  const app = getApp();
  ctx.setData({ 'batchProgress.submitting': true });
  try {
    const { success, failed } = await _executeBatchUpdate(
      params.selectedOrders,
      params.targetProgress,
      params.remark,
    );
    toast[failed ? 'error' : 'success'](`成功${success}，失败${failed}`);

    ctx.setData({
      batchProgress: {
        ...ctx.data.batchProgress,
        submitting: false,
        selectedIds: [],
        progress: '',
        remark: '',
      },
    });

    if (app && typeof app.resetPagedList === 'function') {
      app.resetPagedList(ctx, 'orders');
    }
    await ctx.loadOrders(true);
  } catch (e) {
    if (e && e.type === 'auth') {
      return;
    }
    if (app && typeof app.toastError === 'function') {
      app.toastError(e, '更新失败');
    } else {
      toast.error('更新失败');
    }
  } finally {
    ctx.setData({ 'batchProgress.submitting': false });
  }
}

module.exports = {
  toggleBatchProgress,
  onBatchSelectChange,
  onBatchProgressInput,
  onBatchProgressRemarkInput,
  clearBatchSelection,
  submitBatchProgress,
};
