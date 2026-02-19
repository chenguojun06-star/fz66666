/**
 * 订单数据转换工具
 * 从 work/index.js 提取的纯函数，负责订单数据格式化
 */
const { validateProductionOrder, normalizeData } = require('../../../utils/dataValidator');
const { orderStatusText } = require('../../../utils/orderStatusHelper');
const { parseProductionOrderLines } = require('../../../utils/orderParser');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

/**
 * 安全转换为去空格字符串
 * @param {*} v - 任意值
 * @returns {string} 去空格后的字符串
 */
function normalizeText(v) {
  return (v || '').toString().trim();
}

/**
 * 判断订单是否为已关闭状态
 * @param {string} status - 订单状态
 * @returns {boolean} 是否已关闭
 */
function isClosedStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'canceled' || s === 'paused';
}

/**
 * 构建尺码元数据
 * @param {Object} order - 订单数据
 * @returns {Object} 尺码元数据 { sizeList, sizeQtyList, sizeTotal }
 */
function buildSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) {
    return { sizeList: [], sizeQtyList: [], sizeTotal: 0 };
  }

  const sizeMap = new Map();
  let total = 0;

  lines.forEach(line => {
    const size = normalizeText(line && line.size);
    const qty = Number(line && line.quantity) || 0;
    if (!size || qty <= 0) {
      return;
    }
    total += qty;
    sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
  });

  const sizes = Array.from(sizeMap.keys());
  const sizeQtyList = sizes.map(size => sizeMap.get(size));

  return { sizeList: sizes, sizeQtyList, sizeTotal: total };
}

/**
 * 计算交期和剩余天数
 * @param {Object} source - 订单数据
 * @returns {Object} { deliveryDateStr, remainDays, remainDaysText, remainDaysClass }
 */
function calcDeliveryInfo(source) {
  const raw = source.plannedEndDate || source.expectedShipDate || '';
  if (!raw) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };

  const dateStr = String(raw).substring(0, 10);
  const parts = dateStr.split('-');
  if (parts.length !== 3) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };

  const deliveryDateStr = dateStr;

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

  return { deliveryDateStr, remainDays, remainDaysText, remainDaysClass };
}

/**
 * 验证并规范化订单数据
 * @param {Object} order - 原始订单数据
 * @returns {Object|null} 规范化后的订单或null
 */
function validateAndNormalizeOrder(order) {
  const normalized = normalizeData(order, {
    id: { required: true, type: 'string' },
    orderNo: { required: true, type: 'string' },
    styleNo: { required: true, type: 'string' },
    orderQuantity: { required: true, type: 'number', default: 0 },
    completedQuantity: { required: true, type: 'number', default: 0 },
    productionProgress: { required: true, type: 'number', default: 0 },
    progressWorkflowJson: { required: true, type: 'string', default: '{}' },
    status: { required: true, type: 'string' },
  });

  const validation = validateProductionOrder(normalized);
  if (!validation.valid) {
    return null;
  }

  return normalized;
}

/**
 * 转换订单数据为页面所需格式
 * @param {Object} r - 原始订单数据
 * @returns {Object} 转换后的订单数据
 */
function transformOrderData(r) {
  const validated = validateAndNormalizeOrder(r);
  const source = validated || r || {};
  const sizeMeta = buildSizeMeta(source);
  const delivery = calcDeliveryInfo(source);
  // 构建款式图片完整 URL
  let styleCoverUrl = '';
  if (source.styleCover) {
    const cover = source.styleCover;
    styleCoverUrl = getAuthedImageUrl(cover);
  }

  return {
    ...source,
    styleCoverUrl,
    statusText: orderStatusText(source.status),
    isClosed: isClosedStatus(source.status),
    sizeList: sizeMeta.sizeList,
    sizeQtyList: sizeMeta.sizeQtyList,
    sizeTotal: sizeMeta.sizeTotal,
    deliveryDateStr: delivery.deliveryDateStr,
    remainDays: delivery.remainDays,
    remainDaysText: delivery.remainDaysText,
    remainDaysClass: delivery.remainDaysClass,
  };
}

module.exports = {
  normalizeText,
  isClosedStatus,
  buildSizeMeta,
  calcDeliveryInfo,
  transformOrderData,
  validateAndNormalizeOrder,
};
