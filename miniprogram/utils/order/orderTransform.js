var { validateProductionOrder, normalizeData } = require('./dataValidator');
var { orderStatusText } = require('./orderStatusHelper');
var { parseProductionOrderLines, sortSizeNames } = require('./orderParser');
var { getAuthedImageUrl } = require('../fileUrl');
var { calcOrderProgress } = require('./progressNodes');

function normalizeText(v) {
  return (v || '').toString().trim();
}

function mapUrgencyLabel(level) {
  var text = normalizeText(level).toLowerCase();
  if (text === 'urgent' || text === '急' || text === '加急') return '急';
  if (text === 'normal' || text === '普通') return '普';
  return '';
}

function mapPlateTypeLabel(plateType) {
  var text = normalizeText(plateType).toUpperCase();
  if (text === 'FIRST') return '首';
  if (text === 'REORDER' || text === 'REPLATE') return '翻';
  return '';
}

function mapFactoryTypeLabel(factoryType) {
  var text = normalizeText(factoryType).toUpperCase();
  if (text === 'INTERNAL') return '内部';
  if (text === 'EXTERNAL') return '外部';
  return '';
}

function sortSizes(sizes) {
  return sortSizeNames(sizes);
}

function isClosedStatus(status) {
  var s = normalizeText(status).toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'canceled'
    || s === 'scrapped' || s === 'closed' || s === 'archived';
}

function buildSizeMeta(order) {
  var lines = parseProductionOrderLines(order);
  if (!lines.length) return { sizeList: [], sizeQtyList: [], sizeTotal: 0 };
  var sizeMap = new Map();
  var total = 0;
  lines.forEach(function (line) {
    var size = normalizeText(line && line.size);
    var qty = Number(line && line.quantity) || 0;
    if (!size || qty <= 0) return;
    total += qty;
    sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
  });
  var sizes = Array.from(sizeMap.keys());
  var sizeQtyList = sizes.map(function (size) { return sizeMap.get(size); });
  return { sizeList: sizes, sizeQtyList: sizeQtyList, sizeTotal: total };
}

function buildColorSizeMeta(order) {
  var lines = parseProductionOrderLines(order);
  if (!lines.length) return [];
  var colorMap = new Map();
  var allSizesSet = new Set();
  lines.forEach(function (line) {
    var color = normalizeText(line && line.color);
    var size = normalizeText(line && line.size);
    var qty = Number(line && line.quantity) || 0;
    if (!color || !size || qty <= 0) return;
    allSizesSet.add(size);
    if (!colorMap.has(color)) {
      colorMap.set(color, { color: color, sizeMap: new Map(), total: 0 });
    }
    var current = colorMap.get(color);
    current.sizeMap.set(size, (current.sizeMap.get(size) || 0) + qty);
    current.total += qty;
  });
  var allSizes = sortSizes(Array.from(allSizesSet));
  return {
    groups: Array.from(colorMap.values()).map(function (group) {
      var sizeMapObj = {};
      group.sizeMap.forEach(function (val, key) { sizeMapObj[key] = val; });
      return {
        color: group.color,
        sizeMap: sizeMapObj,
        sizeQtyList: allSizes.map(function (size) { return group.sizeMap.get(size) || 0; }),
        total: group.total,
      };
    }),
    allSizes: allSizes,
  };
}

function calcDeliveryInfo(source) {
  var status = String(source.status || '').toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'canceled' || status === 'scrapped' || status === 'closed' || status === 'archived') {
    var raw = source.plannedEndDate || source.expectedShipDate || '';
    var dateStr = '';
    if (raw) {
      var s = String(raw);
      if (s.length > 10) {
        var d = new Date(s.replace(/-/g, '/'));
        if (!isNaN(d.getTime())) {
          var pad = function (n) { return String(n).padStart(2, '0'); };
          dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } else {
          dateStr = s.substring(0, 16);
        }
      } else {
        dateStr = s.substring(0, 10);
      }
    }
    return { deliveryDateStr: dateStr, remainDays: null, remainDaysText: '已关单', remainDaysClass: 'days-done' };
  }
  var raw = source.plannedEndDate || source.expectedShipDate || '';
  if (!raw) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };
  var dateStr = String(raw);
  if (dateStr.length > 10) {
    var d = new Date(dateStr.replace(/-/g, '/'));
    if (!isNaN(d.getTime())) {
      var pad = function (n) { return String(n).padStart(2, '0'); };
      dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } else {
      dateStr = dateStr.substring(0, 16);
    }
  }
  var deliveryDateStr = dateStr;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var rawDateOnly = String(raw).substring(0, 10);
  var dateParts = rawDateOnly.split('-');
  var target = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
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
      var start = new Date(typeof createRaw === 'string' ? createRaw.replace(' ', 'T') : createRaw);
      var totalDays = Math.ceil((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      var ratio = remainDays / totalDays;
      if (ratio <= 0.2) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-urgent'; }
      else if (ratio <= 0.5) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-warn'; }
      else { remainDaysText = remainDays + '天'; remainDaysClass = 'days-safe'; }
    } else {
      if (remainDays <= 3) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-urgent'; }
      else if (remainDays <= 7) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-warn'; }
      else { remainDaysText = remainDays + '天'; remainDaysClass = 'days-safe'; }
    }
  }
  return { deliveryDateStr: deliveryDateStr, remainDays: remainDays, remainDaysText: remainDaysText, remainDaysClass: remainDaysClass };
}

function validateAndNormalizeOrder(order) {
  var normalized = normalizeData(order, {
    id: { required: true, type: 'string' },
    orderNo: { required: true, type: 'string' },
    styleNo: { required: true, type: 'string' },
    orderQuantity: { required: true, type: 'number', default: 0 },
    completedQuantity: { required: true, type: 'number', default: 0 },
    productionProgress: { required: true, type: 'number', default: 0 },
    progressWorkflowJson: { required: false, default: {} },
    status: { required: true, type: 'string' },
  });
  var validation = validateProductionOrder(normalized);
  if (!validation.valid) return null;
  return normalized;
}

function transformOrderData(r) {
  var validated = validateAndNormalizeOrder(r);
  var source = validated || r || {};
  var sizeMeta = buildSizeMeta(source);
  var colorSizeMeta = buildColorSizeMeta(source);
  var colorGroups = colorSizeMeta.groups || [];
  var allSizes = colorSizeMeta.allSizes || [];
  var delivery = calcDeliveryInfo(source);
  var urgencyTagText = mapUrgencyLabel(source.urgencyLevel || source.urgency_level);
  var plateTypeTagText = mapPlateTypeLabel(source.plateType || source.plate_type);
  var factoryTypeText = mapFactoryTypeLabel(source.factoryType || source.factory_type);
  var orgDisplay = normalizeText(source.orgPath || source.parentOrgUnitName);
  var styleCoverUrl = '';
  if (source.styleCover) {
    styleCoverUrl = getAuthedImageUrl(source.styleCover);
  }
  var totalQuantity = colorGroups.length > 0
    ? colorGroups.reduce(function (sum, g) { return sum + g.total; }, 0)
    : sizeMeta.sizeTotal;
  return Object.assign({}, source, {
    cuttingQty: source.cuttingQuantity != null ? source.cuttingQuantity : (source.cuttingQty || 0),
    orderedQty: source.orderQuantity || 0,
    styleCoverUrl: styleCoverUrl,
    statusText: orderStatusText(source.status),
    isClosed: isClosedStatus(source.status),
    sizeList: sizeMeta.sizeList,
    sizeQtyList: sizeMeta.sizeQtyList,
    sizeTotal: sizeMeta.sizeTotal,
    colorGroups: colorGroups,
    allSizes: allSizes,
    totalQuantity: totalQuantity,
    calculatedProgress: calcOrderProgress(source),
    deliveryDateStr: delivery.deliveryDateStr,
    remainDays: delivery.remainDays,
    remainDaysText: delivery.remainDaysText,
    remainDaysClass: delivery.remainDaysClass,
    urgencyTagText: urgencyTagText,
    plateTypeTagText: plateTypeTagText,
    factoryTypeText: factoryTypeText,
    orgDisplay: orgDisplay,
  });
}

module.exports = {
  normalizeText: normalizeText,
  isClosedStatus: isClosedStatus,
  buildSizeMeta: buildSizeMeta,
  calcDeliveryInfo: calcDeliveryInfo,
  transformOrderData: transformOrderData,
  validateAndNormalizeOrder: validateAndNormalizeOrder,
};
