/**
 * 撤销操作处理器
 * 处理扫码撤销相关的逻辑
 */

import api from '../../../utils/api';
import { showSuccess, showError } from '../../../utils/uiHelper';

// 撤销计时器
let undoTimer = null;

/**
 * 显示撤销提示
 * @param {Object} pageInstance - 页面实例
 * @param {Object} record - 扫码记录
 */
function showUndoNotification(pageInstance, record) {
  const UNDO_COUNTDOWN_SECONDS = 10;

  // 清除之前的计时器
  stopUndoTimer();

  pageInstance.setData({
    undoVisible: true,
    undoCountdown: UNDO_COUNTDOWN_SECONDS,
    undoRecord: record,
  });

  undoTimer = setInterval(() => {
    const currentCountdown = pageInstance.data.undoCountdown - 1;

    if (currentCountdown <= 0) {
      stopUndoTimer();
      pageInstance.setData({
        undoVisible: false,
        undoRecord: null,
      });
    } else {
      pageInstance.setData({ undoCountdown: currentCountdown });
    }
  }, 1000);
}

/**
 * 停止撤销计时器
 */
function stopUndoTimer() {
  if (undoTimer) {
    clearInterval(undoTimer);
    undoTimer = null;
  }
}

/**
 * 执行撤销操作
 * @param {Object} pageInstance - 页面实例
 * @returns {Promise<boolean>}
 */
async function executeUndo(pageInstance) {
  const { undoRecord } = pageInstance.data;

  if (!undoRecord || !undoRecord.id) {
    showError('没有可撤销的记录');
    return false;
  }

  wx.showLoading({ title: '撤销中...', mask: true });

  try {
    await api.production.executeScan({
      action: 'delete',
      recordId: undoRecord.id,
    });

    stopUndoTimer();

    pageInstance.setData({
      undoVisible: false,
      undoRecord: null,
    });

    // 刷新数据
    if (typeof pageInstance.loadMyPanel === 'function') {
      pageInstance.loadMyPanel(true);
    }

    // 触发全局刷新事件
    const eventBus = getApp().globalData.eventBus;
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('SCAN_UNDO', undoRecord);
      eventBus.emit('DATA_REFRESH');
    }

    showSuccess('撤销成功');
    return true;
  } catch (error) {
    console.error('[UndoHandler] 撤销失败:', error);
    showError(error.message || '撤销失败');
    return false;
  } finally {
    wx.hideLoading();
  }
}

/**
 * 隐藏撤销提示
 * @param {Object} pageInstance - 页面实例
 */
function hideUndoNotification(pageInstance) {
  stopUndoTimer();
  pageInstance.setData({
    undoVisible: false,
    undoRecord: null,
  });
}

/**
 * 获取撤销处理器方法
 * @param {Object} pageInstance - 页面实例
 * @returns {Object}
 */
export function createUndoHandler(pageInstance) {
  return {
    /**
     * 显示撤销提示
     */
    showUndo: (record) => showUndoNotification(pageInstance, record),

    /**
     * 执行撤销
     */
    executeUndo: () => executeUndo(pageInstance),

    /**
     * 隐藏撤销提示
     */
    hideUndo: () => hideUndoNotification(pageInstance),

    /**
     * 停止计时器
     */
    stopTimer: stopUndoTimer,
  };
}

export default {
  createUndoHandler,
};
