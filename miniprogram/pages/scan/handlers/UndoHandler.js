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

  page.setData({
    undoVisible: true,
    undoCountdown: UNDO_COUNTDOWN_SECONDS,
    undoRecord: record,
    // 让 WXML 撤回按钮可见（wx:if="{{lastResult.success && undo.canUndo}}"）
    'undo.canUndo': true,
    'undo.loading': false,
  });

  undoTimer = setInterval(() => {
    // 防御性检查：页面可能已卸载或框架重载，page.data 为 null 时自动清除定时器
    if (!page || !page.data) {
      clearInterval(undoTimer);
      undoTimer = null;
      return;
    }
    const next = page.data.undoCountdown - 1;
    if (next <= 0) {
      stopUndoTimer(page);
    } else {
      page.setData({ undoCountdown: next });
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
  page.setData({
    undoVisible: false,
    undoCountdown: 0,
    undoRecord: null,
    // 隐藏撤回按钮
    'undo.canUndo': false,
    'undo.loading': false,
  });
}

/**
 * 执行撤销操作
 */
async function handleUndo(page) {
  const record = page.data.undoRecord;
  const recordId = record?.recordId || record?.data?.recordId || record?.data?.id;

  if (!record || !recordId) {
    toast.error('撤销失败：未找到扫码记录信息');
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
