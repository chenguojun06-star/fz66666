/**
 * 退回重扫处理器 - 从 scan/index.js 拆分
 *
 * 职责：退回重扫弹窗的显示/关闭、确认退回
 *
 * @module RescanHandler
 * @version 1.0
 * @date 2026-02-09
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

const { eventBus } = require('../../../utils/eventBus');

/**
 * 点击"退回重扫"按钮 - 弹出确认弹窗
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRescanRecord(ctx, e) {
  const record = e.currentTarget.dataset.record || {};
  const groupId = e.currentTarget.dataset.groupId || '';
  const recordIdx = e.currentTarget.dataset.recordIdx || 0;

  if (!record.id) {
    toast.error('记录信息异常');
    return;
  }

  ctx.setData({
    rescanConfirm: {
      visible: true,
      loading: false,
      recordId: record.id,
      orderNo: record.orderNo || '-',
      bundleNo: record.bundleNo || '-',
      quantity: record.quantity || 0,
      scanTime: record.createdAt || record.scanTime || '-',
      groupId: groupId,
      recordIdx: recordIdx,
    },
  });
}

/**
 * 取消退回重扫
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onCancelRescan(ctx) {
  ctx.setData({
    'rescanConfirm.visible': false,
    'rescanConfirm.loading': false,
  });
}

/**
 * 确认退回重扫 - 调用后端API（限制1小时）
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 退回成功后刷新列表
 */
async function onConfirmRescan(ctx) {
  const { rescanConfirm } = ctx.data;
  if (rescanConfirm.loading || !rescanConfirm.recordId) return;

  ctx.setData({ 'rescanConfirm.loading': true });

  try {
    await api.production.rescan({ recordId: rescanConfirm.recordId });

    toast.success('退回成功，可重新扫码');

    ctx.setData({
      'rescanConfirm.visible': false,
      'rescanConfirm.loading': false,
    });

    ctx.loadMyHistory(true);
    ctx.loadMyPanel(true);

    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
    }
  } catch (e) {
    ctx.setData({ 'rescanConfirm.loading': false });
    const msg = e?.errMsg || e?.message || e?.data?.message || '退回失败，请稍后重试';
    wx.showModal({
      title: '退回失败',
      content: String(msg),
      showCancel: false,
      confirmText: '知道了',
    });
  }
}

module.exports = {
  onRescanRecord,
  onCancelRescan,
  onConfirmRescan,
};
