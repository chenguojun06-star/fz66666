/**
 * 数据转换工具函数
 * 统一处理API返回数据的转换逻辑
 */

/**
 * 将值转换为数字
 * @param {*} v - 输入值
 * @returns {number} 转换后的数字
 */
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 从数据中按优先级提取数字
 * @param {Object} data - 数据源
 * @param {string[]} keys - 键名列表（按优先级排序）
 * @returns {number} 提取的数字
 */
function pickNumber(data, keys) {
  if (!data || typeof data !== 'object') {
    return 0;
  }
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (data[key] !== null && data[key] !== undefined) {
      return toNumber(data[key]);
    }
  }
  return 0;
}

/**
 * 规范化统计数据
 * @param {Object} payload - API返回的原始数据
 * @returns {Object} 规范化后的统计数据
 */
function normalizeStats(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};

  const productionCount = pickNumber(data, [
    'productionCount',
    'production_count',
    'productionOrderCount',
    'production_order_count',
    'orderCount',
    'ordersCount',
    'productionOrders',
    'production_orders',
  ]);

  const warehousingOrderCount = pickNumber(data, [
    'warehousingOrderCount',
    'warehousing_order_count',
    'todayWarehousingCount',
    'today_warehousing_count',
    'warehousingToday',
    'warehousing_today',
  ]);

  const unqualifiedQuantity = pickNumber(data, [
    'unqualifiedQuantity',
    'unqualified_quantity',
    'defectCount',
    'defect_count',
    'badCount',
    'bad_count',
  ]);

  const materialPurchase = pickNumber(data, [
    'materialPurchase',
    'material_purchase',
    'materialPurchaseCount',
    'material_purchase_count',
    'purchaseCount',
    'purchase_count',
    'procurementCount',
    'procurement_count',
  ]);

  return {
    // 款式统计
    styleCount: pickNumber(data, ['styleCount', 'style_count', 'styleTotal']),

    // 生产订单统计（订单个数）
    productionCount,
    productionOrders: productionCount,

    // 订单总件数
    orderQuantityTotal: pickNumber(data, [
      'orderQuantityTotal',
      'order_quantity_total',
      'totalOrderQuantity',
      'total_order_quantity',
    ]),

    // 待对账统计
    pendingReconciliationCount: pickNumber(data, [
      'pendingReconciliationCount',
      'pending_reconciliation_count',
    ]),

    // 付款审批统计
    paymentApprovalCount: pickNumber(data, ['paymentApprovalCount', 'payment_approval_count']),

    // 今日扫码统计（生产件数）
    todayScanCount: pickNumber(data, ['todayScanCount', 'today_scan_count']),

    // 生产总件数
    totalScanCount: pickNumber(data, ['totalScanCount', 'total_scan_count']),

    // 入库统计（当天）
    warehousingOrderCount,
    warehousingToday: warehousingOrderCount,

    // 入库统计（总数）
    totalWarehousingCount: pickNumber(data, [
      'totalWarehousingCount',
      'total_warehousing_count',
      'warehousingTotal',
      'warehousing_total',
    ]),

    // 不合格品统计
    unqualifiedQuantity,
    defectCount: unqualifiedQuantity,

    // 物料采购统计
    materialPurchase,

    // 紧急事件统计
    urgentEventCount: pickNumber(data, ['urgentEventCount', 'urgent_event_count']),
  };
}

/**
 * 规范化活动列表
 * @param {Object} payload - API返回的原始数据
 * @returns {Array} 规范化后的活动列表
 */
function normalizeActivities(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const list = Array.isArray(data.recentActivities) ? data.recentActivities : [];

  return list
    .map(item => {
      const v = item && typeof item === 'object' ? item : {};
      return {
        id: v.id !== null ? String(v.id) : '',
        type: v.type !== null ? String(v.type) : '',
        content: v.content !== null ? String(v.content) : '',
        time: v.time !== null ? String(v.time) : '',
      };
    })
    .filter(item => item.content);
}

/**
 * 规范化订单数据
 * @param {Object} payload - API返回的原始数据
 * @returns {Object} 规范化后的订单数据
 */
function normalizeOrder(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};

  return {
    id: data.id !== null ? String(data.id) : '',
    orderNo: data.orderNo || data.order_no || '',
    styleNo: data.styleNo || data.style_no || '',
    styleName: data.styleName || data.style_name || '',
    quantity: pickNumber(data, ['quantity', 'totalQuantity', 'total_quantity']),
    status: data.status || '',
    createTime: data.createTime || data.create_time || '',
    // ... 其他字段
  };
}

/**
 * 规范化订单列表
 * @param {Array} payload - API返回的原始数据
 * @returns {Array} 规范化后的订单列表
 */
function normalizeOrderList(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list.map(normalizeOrder);
}

module.exports = {
  toNumber,
  pickNumber,
  normalizeStats,
  normalizeActivities,
  normalizeOrder,
  normalizeOrderList,
};
