/**
 * 订单数据转换工具
 * 从 work/index.js 提取的纯函数，负责订单数据格式化
 */
const { validateProductionOrder, normalizeData } = require('./dataValidator');
const { orderStatusText } = require('./orderStatusHelper');
const { parseProductionOrderLines, sortSizeNames } = require('../../../utils/orderParser');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { calcOrderProgress } = require('./progressNodes');

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
  return sortSizeNames(sizes);
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
      const sizeMapObj = {};
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
 * iOS 安全日期解析：将不带时区信息的日期字符串按本地时间解析
 * 解决 iOS 上 new Date('2024-05-01T08:00:00') 被当作 UTC 解析导致差8小时的问题
 */
function parseSafeLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  var s = String(dateStr).trim();
  if (!s) return new Date(NaN);

  // 含显式时区信息（Z 或 +08:00）→ 交给原生解析
  if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }

  // 手动拆分：YYYY-MM-DD[ T]HH:mm:ss[.sss] → 按本地时间构造
  var match = s.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?)?$/
  );
  if (match) {
    var y = Number(match[1]);
    var mo = Number(match[2]) - 1;
    var d = Number(match[3]);
    var h = match[4] ? Number(match[4]) : 0;
    var mi = match[5] ? Number(match[5]) : 0;
    var se = match[6] ? Number(match[6]) : 0;
    var ms = match[7] ? Math.round(Number('0.' + match[7]) * 1000) : 0;
    return new Date(y, mo, d, h, mi, se, ms);
  }

  // 退化
  return new Date(s);
}

/**
 * 判断订单是否已处于"完成/终止"状态（不应再显示延期倒计时）
 */
function isOrderFinished(source) {
  if (!source) return false;
  var s = String(source.status || '').trim().toLowerCase();
  if (s === 'completed' || s === 'closed' || s === 'cancelled' || s === 'canceled'
    || s === 'scrapped' || s === 'archived') return true;
  if (source.actualEndDate && String(source.actualEndDate).trim()) return true;
  var p = Number(source.productionProgress);
  if (!isNaN(p) && p >= 100) return true;
  return false;
}

/**
 * 计算交期和剩余天数
 * 修复：(1) 已完成订单不再显示"延期N天"；(2) createTime 不再用 'T' 替换空格避免 iOS UTC解析
 */
function calcDeliveryInfo(source) {
  // 先统一判断"已完成/已关单"——包含 status / actualEndDate / productionProgress 三条线索
  if (isOrderFinished(source)) {
    var raw = source.plannedEndDate || source.expectedShipDate || '';
    var dateStr = '';
    if (raw) {
      var d = parseSafeLocalDate(String(raw));
      if (!isNaN(d.getTime())) {
        var pad = function (n) { return String(n).padStart ? String(n).padStart(2, '0') : (n < 10 ? '0' + n : '' + n); };
        dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      } else {
        dateStr = String(raw).substring(0, 16);
      }
    }
    var s2 = String(source.status || '').toLowerCase();
    var text = '已关单';
    if (s2 === 'completed' || (Number(source.productionProgress) >= 100)) text = '已完成';
    else if (s2 === 'scrapped') text = '已报废';
    else if (s2 === 'cancelled' || s2 === 'canceled') text = '已取消';
    return { deliveryDateStr: dateStr, remainDays: null, remainDaysText: text, remainDaysClass: 'days-done' };
  }

  var raw = source.plannedEndDate || source.expectedShipDate || '';
  if (!raw) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };

  var d = parseSafeLocalDate(String(raw));
  var dateStr;
  if (!isNaN(d.getTime())) {
    var pad = function (n) { return String(n).padStart ? String(n).padStart(2, '0') : (n < 10 ? '0' + n : '' + n); };
    dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } else {
    dateStr = String(raw).substring(0, 16);
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  // 从 target 中取年月日，构造本地时间的 Date（不依赖字符串解析，彻底消除iOS差异）
  var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diffMs = target.getTime() - today.getTime();
  var remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  var remainDaysText = '';
  var remainDaysClass = '';

  if (remainDays < 0) {
    remainDaysText = '逾' + Math.abs(remainDays) + '天';
    remainDaysClass = 'days-overdue';
  } else if (remainDays === 0) {
    remainDaysText = '今天';
    remainDaysClass = 'days-urgent';
  } else {
    var createRaw = source.createTime || '';
    if (createRaw) {
      var start = parseSafeLocalDate(String(createRaw));
      if (!isNaN(start.getTime())) {
        var totalDays = Math.ceil((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
        var ratio = remainDays / totalDays;
        if (ratio <= 0.2) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-urgent'; }
        else if (ratio <= 0.5) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-warn'; }
        else { remainDaysText = remainDays + '天'; remainDaysClass = 'days-safe'; }
      }
    }
    if (!remainDaysText) {
      if (remainDays <= 3) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-urgent'; }
      else if (remainDays <= 7) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-warn'; }
      else { remainDaysText = remainDays + '天'; remainDaysClass = 'days-safe'; }
    }
  }

  return { deliveryDateStr: dateStr, remainDays: remainDays, remainDaysText: remainDaysText, remainDaysClass: remainDaysClass };
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
    progressWorkflowJson: { required: false, default: {} },
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
    calculatedProgress: calcOrderProgress(source),
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
