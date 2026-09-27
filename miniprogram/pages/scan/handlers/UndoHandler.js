/**
 * UndoHandler - 撤销功能处理器
 * 从 scan/index.js 提取的撤销相关逻辑
 *
 * @module UndoHandler
 */

const { triggerDataRefresh } = require('../../../utils/eventBus');
const { toast } = require('../../../utils/uiHelper');
const api = require('../../../utils/api');
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.scanLogic.';

// 模块级变量（原全局 undoTimer）
let undoTimer = null;

const UNDO_COUNTDOWN_SECONDS = 10;
const UNDO_TIMER_INTERVAL_MS = 1000;

/**
 * 启动撤销倒计时
 */
function startUndoTimer(page, record) {
  // 清除旧定时器
  if (undoTimer) {
    clearInterval(undoTimer);
    undoTimer = null;
  }

  const scanType = String(record && record.scanType || '').trim().toLowerCase();
  const canUndoCurrentScan = scanType !== 'warehouse';

  page._undoRecord = record;
  page._undoCountdown = UNDO_COUNTDOWN_SECONDS;
  page.setData({
    'undo.canUndo': canUndoCurrentScan,
    'undo.loading': false,
  });

  undoTimer = setInterval(() => {
    if (!page || !page.data) {
      clearInterval(undoTimer);
      undoTimer = null;
      return;
    }
    page._undoCountdown -= 1;
    if (page._undoCountdown <= 0) {
      stopUndoTimer(page);
    }
  }, UNDO_TIMER_INTERVAL_MS);
}

/**
 * 停止撤销倒计时
 */
function stopUndoTimer(page) {
  if (undoTimer) {
    clearInterval(undoTimer);
    undoTimer = null;
  }
  if (!page || !page.data) return;
  page._undoRecord = null;
  page._undoCountdown = 0;
  page.setData({
    'undo.canUndo': false,
    'undo.loading': false,
  });
}

/**
 * 执行撤销操作
 */
async function handleUndo(page) {
  const record = page._undoRecord;
  const recordId = record?.recordId || record?.data?.recordId || record?.data?.id;
  const scanType = String(record && record.scanType || '').trim().toLowerCase();

  if (!record || !recordId) {
    toast.error(i18n.t(NS + 'undoNoRecord'));
    stopUndoTimer(page);
    return;
  }

  if (scanType === 'warehouse') {
    toast.error(i18n.t(NS + 'undoWarehouseBlocked'));
    stopUndoTimer(page);
    return;
  }

  stopUndoTimer(page);

  wx.showLoading({ title: i18n.t(NS + 'undoing'), mask: true });

  try {
    await api.production.undoScan({
      recordId: recordId,
    });

    toast.success(i18n.t(NS + 'undoSuccess'));

    page.setData({
      lastResult: {
        ...page.data.lastResult,
        statusText: i18n.t(NS + 'undoSuccess'),
        statusClass: 'warning',
      },
      lastLocalScanRecord: page.data.lastLocalScanRecord ? {
        ...page.data.lastLocalScanRecord,
        success: false,
        processName: i18n.t(NS + 'undoSuccess'),
      } : null,
      'undo.canUndo': false,
      'undo.loading': false,
    });

    // 刷新统计
    page.loadMyPanel(true);

    // 触发全局事件
    triggerDataRefresh('scan');
  } catch (e) {
    page.setData({ 'undo.loading': false });
    toast.error(i18n.tf(NS + 'undoFailedFmt', { msg: e.errMsg || e.message || i18n.t(NS + 'unknownError') }));
  } finally {
    wx.hideLoading();
  }
}

module.exports = {
  startUndoTimer,
  stopUndoTimer,
  handleUndo,
};
