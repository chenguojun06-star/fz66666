/**
 * HistoryHandler - 扫码历史记录处理器
 * 从 scan/index.js 提取的历史记录相关逻辑
 *
 * 包含：分组算法、历史加载、本地缓存、展开/折叠
 *
 * @module HistoryHandler
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { DEBUG_MODE } = require('../../../config');
const { getStorageValue, setStorageValue } = require('../../../utils/storage');

// ==================== 分组辅助方法 ====================

/**
 * 创建分组键
 * @private
 */
function _createGroupKey(orderNo, progressStage) {
  return `${orderNo || '未知订单'}_${progressStage || '未知工序'}`;
}

/**
 * 创建新分组
 * @private
 */
function _createNewGroup(groupKey, record) {
  return {
    id: groupKey,
    orderNo: record.orderNo || '未知订单',
    styleNo: record.styleNo || '-',
    stage: record.progressStage || record.processName || '未知工序',
    totalQuantity: 0,
    qualifiedCount: 0,
    defectiveCount: 0,
    latestTime: record.scanTime,
    expanded: false,
    items: [],
  };
}

/**
 * 将记录添加到分组
 * @private
 */
function _addRecordToGroup(group, record) {
  group.totalQuantity += record.quantity || 1;

  if (record.scanResult === 'success' || record.scanResult === 'qualified') {
    group.qualifiedCount += record.quantity || 1;
  } else if (record.scanResult === 'defective' || record.scanResult === 'failure') {
    group.defectiveCount += record.quantity || 1;
  } else {
    group.qualifiedCount += record.quantity || 1;
  }

  if (record.scanTime && (!group.latestTime || record.scanTime > group.latestTime)) {
    group.latestTime = record.scanTime;
  }

  group.items.push({
    id: record.id,
    bundleNo: record.bundleNo || '',
    color: record.color,
    size: record.size,
    quantity: record.quantity || 1,
    unitPrice: record.unitPrice,
    createdAt: record.scanTime,
    scanType: record.scanType,
    scanResult: record.scanResult,
    scanCode: record.scanCode || '',
  });
}

/**
 * 按订单+工序分组扫码记录
 */
function groupScanRecords(records) {
  const groupedMap = {};

  records.forEach(record => {
    const groupKey = _createGroupKey(record.orderNo, record.progressStage);

    if (!groupedMap[groupKey]) {
      groupedMap[groupKey] = _createNewGroup(groupKey, record);
    }

    _addRecordToGroup(groupedMap[groupKey], record);
  });

  const groupedList = Object.values(groupedMap);
  groupedList.sort((a, b) => (b.latestTime || '').localeCompare(a.latestTime || ''));

  return groupedList;
}

/**
 * 合并新旧分组数据
 */
function mergeGroupedHistory(existingGroups, newGroups) {
  const existingMap = {};

  existingGroups.forEach(g => {
    existingMap[g.id] = g;
  });

  newGroups.forEach(g => {
    if (existingMap[g.id]) {
      existingMap[g.id].items = existingMap[g.id].items.concat(g.items);
      existingMap[g.id].totalQuantity += g.totalQuantity;
      existingMap[g.id].qualifiedCount += g.qualifiedCount;
      existingMap[g.id].defectiveCount += g.defectiveCount;
      if (g.latestTime > existingMap[g.id].latestTime) {
        existingMap[g.id].latestTime = g.latestTime;
      }
    } else {
      existingMap[g.id] = g;
    }
  });

  const mergedList = Object.values(existingMap);
  mergedList.sort((a, b) => (b.latestTime || '').localeCompare(a.latestTime || ''));

  return mergedList;
}

// ==================== 页面方法 ====================

/**
 * 加载我的扫码历史记录
 * @param {Object} page - 页面实例
 * @param {boolean} refresh - 是否刷新（重置分页）
 */
async function loadMyHistory(page, refresh = false) {
  const { my } = page.data;
  if (my.loadingHistory) {
    return;
  }

  if (!refresh && !my.history.hasMore) {
    return;
  }

  const pageNum = refresh ? 1 : my.history.page;
  const pageSize = my.history.pageSize || 20;

  page.setData({ 'my.loadingHistory': true });

  try {
    const res = await api.production.myScanHistory({ page: pageNum, pageSize });

    const records = res.records || res || [];
    const total = res.total || 0;
    const hasMore = pageNum * pageSize < total;

    let groupedHistory = groupScanRecords(records);

    if (!refresh && my.groupedHistory.length > 0) {
      groupedHistory = mergeGroupedHistory(my.groupedHistory, groupedHistory);
    }

    page.setData({
      'my.groupedHistory': groupedHistory,
      'my.history.page': pageNum + 1,
      'my.history.hasMore': hasMore,
    });

    if (DEBUG_MODE) {
      console.log('[loadMyHistory] 加载成功, 分组数:', groupedHistory.length, '总记录:', records.length);
    }
  } catch (e) {
    console.error('[loadMyHistory] 加载失败:', e);
    if (DEBUG_MODE) {
      wx.showToast({ title: '加载历史失败', icon: 'none' });
    }
  } finally {
    page.setData({ 'my.loadingHistory': false });
  }
}

/**
 * 加载更多历史记录
 */
function loadMoreMyHistory(page) {
  loadMyHistory(page, false);
}

/**
 * 切换分组展开/折叠
 */
function toggleGroupExpand(page, e) {
  const groupId = e.currentTarget.dataset.groupId;
  const { groupedHistory } = page.data.my;
  const idx = groupedHistory.findIndex(g => g.id === groupId);
  if (idx >= 0) {
    page.setData({
      [`my.groupedHistory[${idx}].expanded`]: !groupedHistory[idx].expanded,
    });
  }
}

/**
 * 处理质检记录（点击"处理"按钮）
 */
function onHandleQuality(page, e) {
  const groupId = e.currentTarget.dataset.groupId;
  const recordIdx = e.currentTarget.dataset.recordIdx;

  const { groupedHistory } = page.data.my;
  const group = groupedHistory.find(g => g.id === groupId);
  if (!group || !group.items || !group.items[recordIdx]) {
    toast.error('记录不存在');
    return;
  }

  const record = group.items[recordIdx];

  // 委托到 QualityHandler（通过 page 实例调用）
  page.showQualityModal({
    orderNo: group.orderNo,
    bundleNo: record.bundleNo || '',
    styleNo: group.styleNo || '',
    color: record.color || '',
    size: record.size || '',
    quantity: record.quantity || 1,
    scanCode: record.scanCode || '',
    recordId: record.id,
  });
}

/**
 * 加载本地历史
 */
function loadLocalHistory(page) {
  const history = getStorageValue('scan_history_v2') || [];
  page.setData({ scanHistory: history });
}

/**
 * 添加到本地历史
 */
function addToLocalHistory(page, record) {
  const history = [record, ...page.data.scanHistory].slice(0, 20);
  page.setData({ scanHistory: history });
  setStorageValue('scan_history_v2', history);
}

/**
 * 点击历史记录，如果是质检记录且未完成结果录入，弹出质检弹窗
 */
function onTapHistoryItem(page, e) {
  const index = e.currentTarget.dataset.index;
  const item = page.data.scanHistory[index];

  if (!item) {
    return;
  }

  if (item.data && item.data.scanType === 'quality') {
    page.showQualityModal({
      orderNo: item.data.orderNo,
      bundleNo: item.data.bundleNo,
      styleNo: item.data.styleNo || '',
      color: item.data.color || '',
      size: item.data.size || '',
      quantity: item.data.quantity || 1,
      scanCode: item.data.scanCode || '',
      recordId: item.data.scanId || item.data.recordId,
    });
  }
}

module.exports = {
  // 分组算法（可复用）
  groupScanRecords,
  mergeGroupedHistory,
  // 页面方法
  loadMyHistory,
  loadMoreMyHistory,
  toggleGroupExpand,
  onHandleQuality,
  loadLocalHistory,
  addToLocalHistory,
  onTapHistoryItem,
};
