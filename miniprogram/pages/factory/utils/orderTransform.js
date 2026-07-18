const { validateProductionOrder, normalizeData } = require('./dataValidator');
const { orderStatusText, orderStatusCls } = require('./orderStatusHelper');
const { parseProductionOrderLines, sortSizeNames } = require('../../../utils/orderParser');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { calcOrderProgress } = require('./progressNodes');

function normalizeText(v) {
  return (v || '').toString().trim();
}

function mapUrgencyLabel(level) {
  const text = normalizeText(level).toLowerCase();
  if (text === 'urgent' || text === '急' || text === '加急') return '急';
  if (text === 'normal' || text === '普通') return '普';
  return '';
}

function mapPlateTypeLabel(plateType) {
  const text = normalizeText(plateType).toUpperCase();
  if (text === 'FIRST') return '首';
  if (text === 'REORDER' || text === 'REPLATE') return '翻';
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

function isClosedStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'canceled'
    || s === 'scrapped' || s === 'closed' || s === 'archived';
}

function buildSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) return { sizeList: [], sizeQtyList: [], sizeTotal: 0 };
  const sizeMap = new Map();
  let total = 0;
  lines.forEach(function (line) {
    const size = normalizeText(line && line.size);
    const qty = Number(line && line.quantity) || 0;
    if (!size || qty <= 0) return;
    total += qty;
    sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
  });
  const sizes = Array.from(sizeMap.keys());
  const sizeQtyList = sizes.map(function (size) { return sizeMap.get(size); });
  return { sizeList: sizes, sizeQtyList: sizeQtyList, sizeTotal: total };
}

function buildColorSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) return [];
  const colorMap = new Map();
  const allSizesSet = new Set();
  lines.forEach(function (line) {
    const color = normalizeText(line && line.color);
    const size = normalizeText(line && line.size);
    const qty = Number(line && line.quantity) || 0;
    if (!color || !size || qty <= 0) return;
    allSizesSet.add(size);
    if (!colorMap.has(color)) {
      colorMap.set(color, { color: color, sizeMap: new Map(), total: 0 });
    }
    const current = colorMap.get(color);
    current.sizeMap.set(size, (current.sizeMap.get(size) || 0) + qty);
    current.total += qty;
  });
  const allSizes = sortSizes(Array.from(allSizesSet));
  return {
    groups: Array.from(colorMap.values()).map(function (group) {
      const sizeMapObj = {};
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
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const status = String(source.status || '').toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'canceled' || status === 'scrapped' || status === 'closed' || status === 'archived') {
    var raw = source.plannedEndDate || source.expectedShipDate || '';
    var dateStr = '';
    if (raw) {
      const s = String(raw);
      if (s.length > 10) {
        var d = new Date(s.replace(/-/g, '/'));
        if (!isNaN(d.getTime())) {
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
  raw = source.plannedEndDate || source.expectedShipDate || '';
  if (!raw) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };
  dateStr = String(raw);
  if (dateStr.length > 10) {
    d = new Date(dateStr.replace(/-/g, '/'));
    if (!isNaN(d.getTime())) {
      dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } else {
      dateStr = dateStr.substring(0, 16);
    }
  }
  const deliveryDateStr = dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rawDateOnly = String(raw).substring(0, 10);
  const dateParts = rawDateOnly.split('-');
  const target = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
  const diffMs = target.getTime() - today.getTime();
  const remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  let remainDaysText = '';
  let remainDaysClass = '';
  if (remainDays < 0) {
    remainDaysText = '逾' + Math.abs(remainDays) + '天';
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
  if (!validation.valid) return null;
  return normalized;
}

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
  let styleCoverUrl = '';
  if (source.styleCover) {
    styleCoverUrl = getAuthedImageUrl(source.styleCover);
  }
  const totalQuantity = colorGroups.length > 0
    ? colorGroups.reduce(function (sum, g) { return sum + g.total; }, 0)
    : sizeMeta.sizeTotal;
  return Object.assign({}, source, {
    cuttingQty: source.cuttingQuantity != null ? source.cuttingQuantity : (source.cuttingQty || 0),
    orderedQty: source.orderQuantity || 0,
    styleCoverUrl: styleCoverUrl,
    statusText: orderStatusText(source.status),
    statusCls: orderStatusCls(source.status),
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
