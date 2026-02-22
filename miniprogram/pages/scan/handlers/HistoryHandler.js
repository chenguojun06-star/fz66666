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

// ==================== 交期计算 ====================

/**
 * 计算交期与剩余天数
 * @param {string} dateStr - 日期字符串(YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss)
 * @returns {Object} { deliveryDateStr, remainDays, remainDaysText, remainDaysClass }
 */
function calcDeliveryInfo(dateStr) {
  if (!dateStr) return {};
  const d = String(dateStr).substring(0, 10);
  const parts = d.split('-');
  if (parts.length !== 3) return {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const diffMs = target.getTime() - today.getTime();
  const remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let remainDaysText = '';
  let remainDaysClass = '';
  if (remainDays > 7) {
    remainDaysText = `剩${remainDays}天`;
    remainDaysClass = 'days-safe';
  } else if (remainDays > 3) {
    remainDaysText = `剩${remainDays}天`;
    remainDaysClass = 'days-warn';
  } else if (remainDays > 0) {
    remainDaysText = `剩${remainDays}天❗`;
    remainDaysClass = 'days-urgent';
  } else if (remainDays === 0) {
    remainDaysText = '今天到期❗';
    remainDaysClass = 'days-urgent';
  } else {
    remainDaysText = `超期${Math.abs(remainDays)}天`;
    remainDaysClass = 'days-overdue';
  }

  return { deliveryDateStr: d, remainDays, remainDaysText, remainDaysClass };
}

// ==================== 分组辅助方法 ====================

/**
 * 创建分组键
 * @private
 * @param {string} orderNo - 订单号
 * @param {string} progressStage - 工序阶段
 * @returns {string} 分组键
 */
function _createGroupKey(orderNo, progressStage) {
  return `${orderNo || '未知订单'}_${progressStage || '未知工序'}`;
}

/**
 * 创建新分组
 * @private
 * @param {string} groupKey - 分组键
 * @param {Object} record - 扫码记录
 * @returns {Object} 新分组对象
 */
function _createNewGroup(groupKey, record) {
  return {
    id: groupKey,
    orderNo: record.orderNo || '未知订单',
    orderId: record.orderId || '',
    styleNo: record.styleNo || '-',
    stage: record.progressStage || record.processName || '未知工序',
    totalQuantity: 0,
    qualifiedCount: 0,
    defectiveCount: 0,
    latestTime: record.scanTime,
    expanded: false,
    items: [],
    // 码数聚合
    _sizeMap: {},
    sizeList: [],
    sizeQtyList: [],
    sizeTotal: 0,
    // 交期信息（由 enrichGroupsWithOrderData 填充）
    deliveryDateStr: '',
    remainDaysText: '',
    remainDaysClass: '',
    orderQuantity: 0,
    completedQuantity: 0,
  };
}

/**
 * 将记录添加到分组
 * @private
 * @param {Object} group - 目标分组
 * @param {Object} record - 扫码记录
 * @returns {void}
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

  // 聚合码数
  const size = record.size || '-';
  const qty = record.quantity || 1;
  if (!group._sizeMap[size]) group._sizeMap[size] = 0;
  group._sizeMap[size] += qty;

  // 构建每条记录的码数数组（用于展开时上下对齐显示）
  const sizeStr = record.size || '';
  const sizeArr = sizeStr.includes(',') ? sizeStr.split(',').map(s => s.trim()).filter(Boolean) : (sizeStr ? [sizeStr] : []);
  const totalQty = record.quantity || 1;

  let qtyArr = [];

  // ✅ 优先使用后端返回的裁剪详情数据（真实分布）
  if (record.cuttingDetails && Array.isArray(record.cuttingDetails) && record.cuttingDetails.length > 0) {
    // 使用cutting_bundle的真实数据
    const detailsMap = {};
    record.cuttingDetails.forEach(detail => {
      detailsMap[detail.size] = detail.quantity;
    });
    qtyArr = sizeArr.map(size => detailsMap[size] || 0);
  }
  // ❌ 降级方案：平均分配（仅用于没有cuttingDetails的情况）
  else if (sizeArr.length > 1) {
    const base = Math.floor(totalQty / sizeArr.length);
    const remainder = totalQty % sizeArr.length;
    qtyArr = sizeArr.map((_, i) => base + (i >= sizeArr.length - remainder ? 1 : 0));
  } else {
    qtyArr = [totalQty];
  }

  // 是否在1小时内（用于控制「退回重扫」和「撤回」按钮是否显示）
  let canRescan = false;
  if (record.scanTime) {
    const scanTimeMs = new Date(String(record.scanTime).replace(' ', 'T')).getTime();
    canRescan = !isNaN(scanTimeMs) && (Date.now() - scanTimeMs < 3600 * 1000);
  }

  // 是否已参与工资结算（已结算禁止撤回/退回）
  const payrollSettled = !!(record.payrollSettlementId);

  group.items.push({
    id: record.id,
    orderNo: record.orderNo || '',
    bundleNo: record.cuttingBundleNo || record.bundleNo || '',
    color: record.color,
    size: record.size,
    sizeArr: sizeArr,
    qtyArr: qtyArr,
    quantity: record.quantity || 1,
    unitPrice: record.unitPrice,
    createdAt: record.scanTime,
    scanType: record.scanType,
    scanResult: record.scanResult,
    scanCode: record.scanCode || '',
    canRescan: canRescan && !payrollSettled,
    canUndo: canRescan && !payrollSettled,
    payrollSettled: payrollSettled,
  });
}

/**
 * 按订单+工序分组扫码记录
 * @param {Array} records - 扫码记录列表
 * @returns {Array} 分组后的记录列表
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

  // 计算码数聚合结果
  groupedList.forEach(g => {
    const sizes = Object.keys(g._sizeMap);
    g.sizeList = sizes;
    g.sizeQtyList = sizes.map(s => g._sizeMap[s]);
    g.sizeTotal = sizes.reduce((sum, s) => sum + g._sizeMap[s], 0);
    delete g._sizeMap; // 清理临时字段
  });

  groupedList.sort((a, b) => (b.latestTime || '').localeCompare(a.latestTime || ''));

  return groupedList;
}

/**
 * 用订单数据丰富分组（交期、订单件数、完成件数）
 * 批量获取订单列表，匹配到分组后填充交期信息
 * @param {Array} groups - 分组列表
 * @returns {Promise<void>} 异步填充分组交期信息
 */
async function enrichGroupsWithOrderData(groups) {
  const orderNos = [];
  const seen = {};
  groups.forEach(g => {
    if (g.orderNo && g.orderNo !== '未知订单' && !seen[g.orderNo]) {
      orderNos.push(g.orderNo);
      seen[g.orderNo] = true;
    }
  });
  if (orderNos.length === 0) return;

  try {
    // 批量获取订单列表
    const result = await api.production.listOrders({ page: 1, pageSize: 200 });
    const orders = result.records || result || [];

    const orderMap = {};
    orders.forEach(o => {
      if (o.orderNo) orderMap[o.orderNo] = o;
    });

    groups.forEach(g => {
      const order = orderMap[g.orderNo];
      if (!order) return;

      // 交期信息
      const raw = order.plannedEndDate || order.expectedShipDate || '';
      const delivery = calcDeliveryInfo(raw);
      g.deliveryDateStr = delivery.deliveryDateStr || '';
      g.remainDaysText = delivery.remainDaysText || '';
      g.remainDaysClass = delivery.remainDaysClass || '';

      // 订单数量信息
      g.orderQuantity = order.orderQuantity || order.totalQuantity || 0;
      g.completedQuantity = order.completedQuantity || 0;
    });
  } catch (e) {
    if (DEBUG_MODE) {
      console.error('[enrichGroupsWithOrderData] error:', e);
    }
  }
}

/**
 * 合并新旧分组数据
 * @param {Array} existingGroups - 已有分组
 * @param {Array} newGroups - 新加载的分组
 * @returns {Array} 合并后的分组列表
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
 * 获取今天日期字符串 YYYY-MM-DD
 * @returns {string} 今天的日期
 */
function _getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 加载我的扫码历史记录（仅当天）
 * @param {Object} page - 页面实例
 * @param {boolean} refresh - 是否刷新（重置分页）
 * @returns {Promise<void>} 异步加载并更新页面数据
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
    // 只查询当天记录
    const today = _getToday();
    const res = await api.production.myScanHistory({
      page: pageNum,
      pageSize,
      startTime: today + ' 00:00:00',
      endTime: today + ' 23:59:59',
    });

    const records = res.records || res || [];
    const total = res.total || 0;
    const hasMore = pageNum * pageSize < total;

    let groupedHistory = groupScanRecords(records);

    if (!refresh && my.groupedHistory.length > 0) {
      groupedHistory = mergeGroupedHistory(my.groupedHistory, groupedHistory);
    }

    // 先设置基础数据（快速渲染）
    page.setData({
      'my.groupedHistory': groupedHistory,
      'my.history.page': pageNum + 1,
      'my.history.hasMore': hasMore,
    });

    // 异步丰富订单数据（交期、件数）
    enrichGroupsWithOrderData(groupedHistory).then(() => {
      page.setData({ 'my.groupedHistory': groupedHistory });
    });

    if (DEBUG_MODE) {
      // eslint-disable-next-line no-console
    }
  } catch (e) {
    console.error('[loadMyHistory] 加载失败:', e.message || e);
    // 始终提示用户加载失败，便于排查"重新打开后记录消失"问题
    wx.showToast({ title: '加载记录失败，请下拉刷新', icon: 'none', duration: 2500 });
  } finally {
    page.setData({ 'my.loadingHistory': false });
  }
}

/**
 * 加载更多历史记录
 * @param {Object} page - 页面实例
 * @returns {void}
 */
function loadMoreMyHistory(page) {
  loadMyHistory(page, false);
}

/**
 * 切换分组展开/折叠
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
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
 * 切换码数明细展开/折叠
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function toggleSizeExpand(page, e) {
  const groupId = e.currentTarget.dataset.groupId;
  const { groupedHistory } = page.data.my;
  const idx = groupedHistory.findIndex(g => g.id === groupId);
  if (idx >= 0) {
    page.setData({
      [`my.groupedHistory[${idx}].sizeExpanded`]: !groupedHistory[idx].sizeExpanded,
    });
  }
}

/**
 * 处理质检记录（点击"处理"按钮）
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
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
    bundleNo: record.bundleNo || record.cuttingBundleNo || '',
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
 * @param {Object} page - 页面实例
 * @returns {void}
 */
function loadLocalHistory(page) {
  const history = getStorageValue('scan_history_v2') || [];
  page.setData({ scanHistory: history });
}

/**
 * 添加到本地历史
 * @param {Object} page - 页面实例
 * @param {Object} record - 扫码记录
 * @returns {void}
 */
function addToLocalHistory(page, record) {
  const history = [record, ...page.data.scanHistory].slice(0, 20);
  page.setData({ scanHistory: history });
  setStorageValue('scan_history_v2', history);
}

/**
 * 点击历史记录，如果是质检记录且未完成结果录入，弹出质检弹窗
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
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
  toggleSizeExpand,
  onHandleQuality,
  loadLocalHistory,
  addToLocalHistory,
  onTapHistoryItem,
};
