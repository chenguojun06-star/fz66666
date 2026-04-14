/**
 * 订单数据转换工具
 * 从 work/index.js 提取的纯函数，负责订单数据格式化
 */
const { validateProductionOrder, normalizeData } = require('../../../utils/dataValidator');
const { orderStatusText } = require('../../../utils/orderStatusHelper');
const { parseProductionOrderLines, SIZE_ORDER } = require('../../../utils/orderParser');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

/**
 * 安全转换为去空格字符串
 * @param {*} v - 任意值
 * @returns {string} 去空格后的字符串
 */
function normalizeText(v) {
  return (v || '').toString().trim();
}

function mapUrgencyLabel(level) {
  const text = normalizeText(level).toLowerCase();
  if (text === 'urgent' || text === '急' || text === '加急') {
    return '急';
  }
  if (text === 'normal' || text === '普通') {
    return '普';
  }
  return '';
}

function mapPlateTypeLabel(plateType) {
  const text = normalizeText(plateType).toUpperCase();
  if (text === 'FIRST') {
    return '首';
  }
  if (text === 'REORDER' || text === 'REPLATE') {
    return '翻';
  }
  return '';
}

function mapFactoryTypeLabel(factoryType) {
  const text = normalizeText(factoryType).toUpperCase();
  if (text === 'INTERNAL') return '内部';
  if (text === 'EXTERNAL') return '外部';
  return '';
}

function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const left = normalizeText(a).toUpperCase();
    const right = normalizeText(b).toUpperCase();
    const leftIndex = SIZE_ORDER.indexOf(left);
    const rightIndex = SIZE_ORDER.indexOf(right);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.localeCompare(right, 'zh-CN', { numeric: true });
  });
}

/**
 * 判断订单是否为已关闭状态
 * @param {string} status - 订单状态
 * @returns {boolean} 是否已关闭
 */
function isClosedStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'canceled'
    || s === 'scrapped' || s === 'closed' || s === 'archived';
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

function buildColorSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) {
    return [];
  }

  const colorMap = new Map();
  const allSizesSet = new Set();

  lines.forEach(line => {
    const color = normalizeText(line && line.color);
    const size = normalizeText(line && line.size);
    const qty = Number(line && line.quantity) || 0;
    if (!color || !size || qty <= 0) {
      return;
    }

    allSizesSet.add(size);

    if (!colorMap.has(color)) {
      colorMap.set(color, { color, sizeMap: new Map(), total: 0 });
    }
    const current = colorMap.get(color);
    current.sizeMap.set(size, (current.sizeMap.get(size) || 0) + qty);
    current.total += qty;
  });

  // 先获取所有尺码并排序
  const allSizes = sortSizes(Array.from(allSizesSet));

  return {
    groups: Array.from(colorMap.values()).map(group => {
      // sizeMap 转为普通对象，供 WXML 模板 cg.sizeMap[sz] 访问
      var sizeMapObj = {};
      group.sizeMap.forEach(function (val, key) { sizeMapObj[key] = val; });
      return {
        color: group.color,
        sizeMap: sizeMapObj,
        sizeQtyList: allSizes.map(size => group.sizeMap.get(size) || 0),
        total: group.total,
      };
    }),
    allSizes,
  };
}

/**
 * 计算交期和剩余天数
 * 颜色逻辑与 PC 端 progressColor.ts 保持一致：
 *   有 createTime 时按比例：≤20% → red，≤50% → yellow，>50% → green
 *   无 createTime 时固定阈值：≤3天 → urgent，≤7天 → warn，>7天 → safe
 * @param {Object} source - 订单数据（需包含 plannedEndDate/expectedShipDate，可选 createTime）
 * @returns {Object} { deliveryDateStr, remainDays, remainDaysText, remainDaysClass }
 */
function calcDeliveryInfo(source) {
  // 已关单 / 已完成：停止倒计时，直接显示关单状态
  const status = String(source.status || '').toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'canceled' || status === 'scrapped' || status === 'closed' || status === 'archived') {
    const raw = source.plannedEndDate || source.expectedShipDate || '';
    const dateStr = raw ? String(raw).substring(0, 10) : '';
    return {
      deliveryDateStr: dateStr,
      remainDays: null,
      remainDaysText: '已关单',
      remainDaysClass: 'days-done',
    };
  }

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

  if (remainDays < 0) {
    remainDaysText = `逾${Math.abs(remainDays)}天`;
    remainDaysClass = 'days-overdue';
  } else if (remainDays === 0) {
    remainDaysText = '今天';
    remainDaysClass = 'days-urgent';
  } else {
    const createRaw = source.createTime || '';
    if (createRaw) {
      const start = new Date(typeof createRaw === 'string' ? createRaw.replace(' ', 'T') : createRaw);
      const totalDays = Math.ceil((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const ratio = remainDays / totalDays;
      if (ratio <= 0.2) {
        remainDaysText = `${remainDays}天`;
        remainDaysClass = 'days-urgent';
      } else if (ratio <= 0.5) {
        remainDaysText = `${remainDays}天`;
        remainDaysClass = 'days-warn';
      } else {
        remainDaysText = `${remainDays}天`;
        remainDaysClass = 'days-safe';
      }
    } else {
      if (remainDays <= 3) {
        remainDaysText = `${remainDays}天`;
        remainDaysClass = 'days-urgent';
      } else if (remainDays <= 7) {
        remainDaysText = `${remainDays}天`;
        remainDaysClass = 'days-warn';
      } else {
        remainDaysText = `${remainDays}天`;
        remainDaysClass = 'days-safe';
      }
    }
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
  const colorSizeMeta = buildColorSizeMeta(source);
  const colorGroups = colorSizeMeta.groups || [];
  const allSizes = colorSizeMeta.allSizes || [];
  const delivery = calcDeliveryInfo(source);
  const urgencyTagText = mapUrgencyLabel(source.urgencyLevel || source.urgency_level);
  const plateTypeTagText = mapPlateTypeLabel(source.plateType || source.plate_type);
  const factoryTypeText = mapFactoryTypeLabel(source.factoryType || source.factory_type);
  const orgDisplay = normalizeText(source.orgPath || source.parentOrgUnitName);
  // 构建款式图片完整 URL
  let styleCoverUrl = '';
  if (source.styleCover) {
    const cover = source.styleCover;
    styleCoverUrl = getAuthedImageUrl(cover);
  }

  // 计算总数量
  const totalQuantity = colorGroups.length > 0
    ? colorGroups.reduce((sum, g) => sum + g.total, 0)
    : sizeMeta.sizeTotal;

  return {
    ...source,
    cuttingQty: source.cuttingQuantity != null ? source.cuttingQuantity : (source.cuttingQty || 0),
    orderedQty: source.orderQuantity || 0,
    styleCoverUrl,
    statusText: orderStatusText(source.status),
    isClosed: isClosedStatus(source.status),
    sizeList: sizeMeta.sizeList,
    sizeQtyList: sizeMeta.sizeQtyList,
    sizeTotal: sizeMeta.sizeTotal,
    colorGroups,
    allSizes,
    totalQuantity,
    deliveryDateStr: delivery.deliveryDateStr,
    remainDays: delivery.remainDays,
    remainDaysText: delivery.remainDaysText,
    remainDaysClass: delivery.remainDaysClass,
    urgencyTagText,
    plateTypeTagText,
    factoryTypeText,
    orgDisplay,
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
