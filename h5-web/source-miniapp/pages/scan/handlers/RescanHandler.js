/**
 * 退回重扫处理器
 * 退回重扫已迁移为独立页面 /pages/scan/rescan/index，此处仅保留页面导航
 *
 * @module RescanHandler
 */

const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { normalizeProcessName } = require('../../../utils/displayHelper');

/**
 * 点击"退回重扫"按钮 — 跳转独立页面 /pages/scan/rescan/index
 */
function onRescanRecord(ctx, e) {
  const record = e.currentTarget.dataset.record || {};
  const groupId = e.currentTarget.dataset.groupId || '';
  const recordIdx = e.currentTarget.dataset.recordIdx || 0;

  if (!record.id) {
    toast.error('记录信息异常');
    return;
  }

  getApp().globalData.rescanData = {
    recordId: record.id,
    orderNo: record.orderNo || '-',
    bundleNo: record.bundleNo || '-',
    quantity: record.quantity || 0,
    scanTime: record.createdAt || record.scanTime || '-',
    groupId: groupId,
    recordIdx: recordIdx,
    coverImage: getAuthedImageUrl(record.coverImage || record.styleImage || ''),
    styleNo: record.styleNo || '',
    processName: normalizeProcessName(record.processName || ''),
  };
  safeNavigate({ url: '/pages/scan/rescan/index' }).catch(() => {});
}

module.exports = {
  onRescanRecord,
};
