/**
 * 数据加载处理器
 * 处理扫码页面的数据加载和刷新逻辑
 */

import api from '../../../utils/api';
import { normalizeStats, normalizeActivities } from '../../../utils/dataTransform';

/**
 * 加载我的面板数据
 * @param {Object} pageInstance - 页面实例
 * @param {boolean} forceRefresh - 是否强制刷新
 * @returns {Promise<Object>}
 */
async function loadMyPanelData(pageInstance, forceRefresh = false) {
  const { currentUser, myPanelData, isMyPanelLoading } = pageInstance.data;

  // 防止重复加载
  if (isMyPanelLoading) {
    // console.log('[DataHandler] 面板数据正在加载中，跳过');
    return myPanelData;
  }

  // 检查缓存（5分钟内不重复加载）
  if (!forceRefresh && myPanelData && myPanelData._timestamp) {
    const cacheAge = Date.now() - myPanelData._timestamp;
    if (cacheAge < 5 * 60 * 1000) {
      // console.log('[DataHandler] 使用缓存的面板数据');
      return myPanelData;
    }
  }

  pageInstance.setData({ isMyPanelLoading: true });

  try {
    const userId = currentUser?.id;
    if (!userId) {
      console.warn('[DataHandler] 用户未登录，无法加载面板数据');
      return null;
    }

    // 并行加载多个数据
    const [statsRes, activitiesRes] = await Promise.all([
      api.dashboard.getWorkerStats(userId),
      api.dashboard.getRecentActivities(userId),
    ]);

    const stats = normalizeStats(statsRes);
    const activities = normalizeActivities(activitiesRes);

    const panelData = {
      stats,
      activities,
      _timestamp: Date.now(),
    };

    pageInstance.setData({
      myPanelData: panelData,
      isMyPanelLoading: false,
    });

    return panelData;
  } catch (error) {
    console.error('[DataHandler] 加载面板数据失败:', error);
    pageInstance.setData({ isMyPanelLoading: false });
    return null;
  }
}

/**
 * 加载扫码历史
 * @param {Object} pageInstance - 页面实例
 * @returns {Promise<Array>}
 */
async function loadScanHistory(pageInstance) {
  try {
    const history = wx.getStorageSync('scan_history_v2') || [];
    pageInstance.setData({ scanHistory: history });
    return history;
  } catch (error) {
    console.error('[DataHandler] 加载扫码历史失败:', error);
    return [];
  }
}

/**
 * 添加到扫码历史
 * @param {Object} pageInstance - 页面实例
 * @param {Object} record - 扫码记录
 */
function addToScanHistory(pageInstance, record) {
  try {
    let history = wx.getStorageSync('scan_history_v2') || [];

    // 添加到开头
    history.unshift({
      ...record,
      _timestamp: Date.now(),
    });

    // 最多保留20条
    if (history.length > 20) {
      history = history.slice(0, 20);
    }

    wx.setStorageSync('scan_history_v2', history);

    // 更新页面数据
    pageInstance.setData({ scanHistory: history });
  } catch (error) {
    console.error('[DataHandler] 添加到扫码历史失败:', error);
  }
}

/**
 * 加载订单详情
 * @param {string} orderNo - 订单号
 * @returns {Promise<Object|null>}
 */
async function loadOrderDetail(orderNo) {
  if (!orderNo) {
    console.warn('[DataHandler] 订单号为空');
    return null;
  }

  try {
    const order = await api.production.orderDetailByOrderNo(orderNo);
    return order;
  } catch (error) {
    console.error('[DataHandler] 加载订单详情失败:', error);
    return null;
  }
}

/**
 * 获取数据处理器方法
 * @param {Object} pageInstance - 页面实例
 * @returns {Object}
 */
export function createDataHandler(pageInstance) {
  return {
    /**
     * 加载我的面板数据
     */
    loadMyPanel: (forceRefresh) => loadMyPanelData(pageInstance, forceRefresh),

    /**
     * 加载扫码历史
     */
    loadHistory: () => loadScanHistory(pageInstance),

    /**
     * 添加到扫码历史
     */
    addToHistory: (record) => addToScanHistory(pageInstance, record),

    /**
     * 加载订单详情
     */
    loadOrderDetail,
  };
}

export default {
  createDataHandler,
};
