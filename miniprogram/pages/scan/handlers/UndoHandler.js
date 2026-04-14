/**
 * UndoHandler - 撤销功能处理器
 * 从 scan/index.js 提取的撤销相关逻辑
 *
 * @module UndoHandler
 */

const { eventBus } = require('../../../utils/eventBus');
const { toast } = require('../../../utils/uiHelper');
const api = require('../../../utils/api');

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
    toast.error('撤销失败：未找到扫码记录信息');
    stopUndoTimer(page);
    return;
  }

  if (scanType === 'warehouse') {
    toast.error('入库记录不支持直接撤回，请先走出库，再重新入库');
    stopUndoTimer(page);
    return;
  }

  stopUndoTimer(page);

  wx.showLoading({ title: '正在撤销...', mask: true });

  try {
    await api.production.undoScan({
      recordId: recordId,
    });

    toast.success('已撤销');

    page.setData({
      lastResult: {
        ...page.data.lastResult,
        statusText: '已撤销',
        statusClass: 'warning',
      },
      'undo.canUndo': false,
      'undo.loading': false,
    });

    // 刷新统计
    page.loadMyPanel(true);

    // 触发全局事件
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
    }
  } catch (e) {
    page.setData({ 'undo.loading': false });
    toast.error('撤销失败: ' + (e.errMsg || e.message || '未知错误'));
  } finally {
    wx.hideLoading();
  }
}

module.exports = {
  startUndoTimer,
  stopUndoTimer,
  handleUndo,
};
