import { getAuthedImageUrl } from '@/utils/fileUrl';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL'];

/** 将进度值钳位到 [0, 100] 整数范围，与 frontend calcOrderProgress.ts 保持一致 */
function clampProgress(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

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

function orderStatusText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    pending: '待生产', production: '生产中', completed: '已完成',
    delayed: '已逾期', scrapped: '已报废', cancelled: '已取消',
    canceled: '已取消', paused: '已暂停', returned: '已退回',
    closed: '已关单', archived: '已归档',
  };
  return map[s] || '';
}

function isClosedStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'canceled'
    || s === 'scrapped' || s === 'closed' || s === 'archived';
}

function parseOrderDetailsJSON(detailsRaw) {
  if (!detailsRaw || !String(detailsRaw).trim()) return null;
  try {
    return typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
  } catch (e) {
    return null;
  }
}

function extractListArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const candidate = parsed.lines || parsed.items || parsed.details || parsed.list || parsed.orderLines;
    return Array.isArray(candidate) ? candidate : [parsed];
  }
  return [];
}

function normalizeOrderLine(r) {
  const color = String(r.color || r.colour || r.colorName || '').trim();
  const size = String(r.size || r.sizeName || r.spec || '').trim();
  const quantity = Number(r.quantity || r.qty || r.count || 0) || 0;
  return { color, size, quantity };
}

function parseProductionOrderLines(order) {
  if (!order) return [];
  const parsed = parseOrderDetailsJSON(order.orderDetails);
  const list = extractListArray(parsed);
  const normalized = list.map(normalizeOrderLine).filter(l => l.color && l.size && l.quantity > 0);
  if (normalized.length > 0) return normalized;
  const color = String(order.color || '').trim();
  const size = String(order.size || '').trim();
  const qty = Number(order.orderQuantity || order.quantity || 0) || 0;
  if (color && size && qty > 0) return [{ color, size, quantity: qty }];
  return [];
}

function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const li = SIZE_ORDER.indexOf(a.toUpperCase());
    const ri = SIZE_ORDER.indexOf(b.toUpperCase());
    if (li !== -1 && ri !== -1) return li - ri;
    if (li !== -1) return -1;
    if (ri !== -1) return 1;
    return a.localeCompare(b, 'zh-CN', { numeric: true });
  });
}

function buildSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) return { sizeList: [], sizeQtyList: [], sizeTotal: 0 };
  const sizeMap = new Map();
  let total = 0;
  lines.forEach(line => {
    const size = normalizeText(line.size);
    const qty = line.quantity || 0;
    if (!size || qty <= 0) return;
    total += qty;
    sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
  });
  const sizes = Array.from(sizeMap.keys());
  return { sizeList: sizes, sizeQtyList: sizes.map(s => sizeMap.get(s)), sizeTotal: total };
}

function buildColorSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) return { groups: [], allSizes: [] };
  const colorMap = new Map();
  const allSizesSet = new Set();
  lines.forEach(line => {
    const color = normalizeText(line.color);
    const size = normalizeText(line.size);
    const qty = line.quantity || 0;
    if (!color || !size || qty <= 0) return;
    allSizesSet.add(size);
    if (!colorMap.has(color)) colorMap.set(color, { color, sizeMap: new Map(), total: 0 });
    const cur = colorMap.get(color);
    cur.sizeMap.set(size, (cur.sizeMap.get(size) || 0) + qty);
    cur.total += qty;
  });
  const allSizes = sortSizes(Array.from(allSizesSet));
  return {
    groups: Array.from(colorMap.values()).map(g => {
      const sizeMapObj = {};
      g.sizeMap.forEach((val, key) => { sizeMapObj[key] = val; });
      return { color: g.color, sizeMap: sizeMapObj, sizeQtyList: allSizes.map(s => g.sizeMap.get(s) || 0), total: g.total };
    }),
    allSizes,
  };
}

function calcDeliveryInfo(source) {
  const status = String(source.status || '').toLowerCase();
  if (['completed', 'cancelled', 'canceled', 'scrapped', 'closed', 'archived'].includes(status)) {
    const raw = source.plannedEndDate || source.expectedShipDate || '';
    const dateStr = raw ? String(raw).substring(0, 10) : '';
    return { deliveryDateStr: dateStr, remainDays: null, remainDaysText: '已关单', remainDaysClass: 'days-done' };
  }
  const raw = source.plannedEndDate || source.expectedShipDate || source.deliveryDate || '';
  if (!raw) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };
  const dateStr = String(raw).substring(0, 10);
  const parts = dateStr.split('-');
  if (parts.length !== 3) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };
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
      remainDaysText = `${remainDays}天`;
      remainDaysClass = ratio <= 0.2 ? 'days-urgent' : ratio <= 0.5 ? 'days-warn' : 'days-safe';
    } else {
      remainDaysText = `${remainDays}天`;
      remainDaysClass = remainDays <= 3 ? 'days-urgent' : remainDays <= 7 ? 'days-warn' : 'days-safe';
    }
  }
  return { deliveryDateStr: dateStr, remainDays, remainDaysText, remainDaysClass };
}

const DEFAULT_PROCESS_NODES = [
  { id: 'procurement', name: '采购' },
  { id: 'cutting', name: '裁剪' },
  { id: 'secondaryProcess', name: '二次工艺' },
  { id: 'carSewing', name: '车缝' },
  { id: 'tailProcess', name: '尾部' },
  { id: 'warehousing', name: '入库' },
];

const STAGE_RATE_MAP = [
  { match: '采购', fields: ['procurementCompletionRate'] },
  { match: '裁剪', fields: ['cuttingCompletionRate'] },
  { match: '二次工艺', fields: ['secondaryProcessRate', 'secondaryProcessCompletionRate'] },
  { match: '车缝', fields: ['carSewingCompletionRate', 'sewingCompletionRate'] },
  { match: '尾部', fields: ['tailProcessRate', 'ironingCompletionRate'] },
  { match: '入库', fields: ['warehousingCompletionRate'] },
  { match: '质检', fields: ['qualityCompletionRate'] },
  { match: '包装', fields: ['packagingCompletionRate'] },
];

function clampPercent(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const CORE_STAGES_FOR_PROGRESS = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

function calcOrderProgress(order) {
  if (!order) return 0;
  const dbProgress = clampPercent(Number(order.productionProgress) || 0);
  const status = (order.status || '').trim().toLowerCase();
  if (status === 'completed') return 100;

  const orderNo = (order.orderNo || '').trim().toUpperCase();
  const orderBizType = (order.orderBizType || '').trim().toUpperCase();
  const isDirectCutting = orderBizType === 'CUTTING_DIRECT' || orderNo.startsWith('CUT');

  const hasProcurement = !isDirectCutting && (
    (Number(order.materialArrivalRate) || 0) > 0
    || Boolean(order.procurementManuallyCompleted)
    || Boolean(order.procurementConfirmedAt)
  );
  const pipeline = hasProcurement
    ? CORE_STAGES_FOR_PROGRESS
    : CORE_STAGES_FOR_PROGRESS.filter(s => s !== '采购');

  let rateSum = 0;
  let rateCount = 0;
  for (const stage of pipeline) {
    const rate = getNodeRateFromOrder(stage, order);
    if (rate >= 0) {
      rateSum += rate;
      rateCount++;
    }
  }
  const rateProgress = rateCount > 0 ? Math.round(rateSum / rateCount) : 0;

  const hasCuttingAction = (Number(order.cuttingCompletionRate) || 0) > 0
    && (Number(order.cuttingBundleCount) || 0) > 0;
  const hasRateAction = rateProgress > 0;
  const hasRealAction = hasProcurement || hasCuttingAction || hasRateAction;
  if (!hasRealAction) return 0;

  return clampProgress(Math.max(dbProgress, rateProgress));
}

function stripShipmentNode(list) {
  return (Array.isArray(list) ? list : []).filter(n => {
    const id = normalizeText(n && n.id).toLowerCase();
    const name = normalizeText(n && n.name);
    return !(id === 'shipment' || name === '出货' || name === '发货' || name === '发运');
  });
}

function parseProgressNodes(raw) {
  const text = normalizeText(raw);
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    const nodesRaw = obj && Array.isArray(obj.nodes) ? obj.nodes : [];
    return stripShipmentNode(
      nodesRaw.map(n => {
        const name = normalizeText(n && n.name);
        const id = normalizeText(n && n.id) || name;
        return name ? { id, name } : null;
      }).filter(n => n && n.name),
    );
  } catch (e) { return []; }
}

function resolveNodesFromOrder(order) {
  const parsed = parseProgressNodes(normalizeText(order && order.progressWorkflowJson));
  return parsed.length ? parsed : DEFAULT_PROCESS_NODES;
}

function getNodeRateFromOrder(nodeName, order) {
  const name = (nodeName || '').trim();
  for (let i = 0; i < STAGE_RATE_MAP.length; i++) {
    const entry = STAGE_RATE_MAP[i];
    if (name === entry.match || name.indexOf(entry.match) >= 0 || entry.match.indexOf(name) >= 0) {
      for (let j = 0; j < entry.fields.length; j++) {
        const val = Number(order[entry.fields[j]]) || 0;
        if (val > 0) return clampPercent(val);
      }
    }
  }
  return -1;
}

function buildProcessNodes(order) {
  const nodes = resolveNodesFromOrder(order);
  if (!nodes || !nodes.length) return [];
  const progress = Number(order.productionProgress) || 0;
  let hasAnyRate = false;
  const result = nodes.map(n => {
    const name = n.name || n;
    const rate = getNodeRateFromOrder(name, order);
    if (rate >= 0) { hasAnyRate = true; return { name, percent: rate }; }
    return { name, percent: -1 };
  });
  if (hasAnyRate) {
    return result.map(r => ({ name: r.name, percent: r.percent >= 0 ? r.percent : 0 }));
  }
  const len = nodes.length;
  const perNode = 100 / len;
  return nodes.map((n, i) => {
    const nodeStart = i * perNode;
    const nodeEnd = (i + 1) * perNode;
    let pct = 0;
    if (progress >= nodeEnd) pct = 100;
    else if (progress > nodeStart) pct = Math.round(((progress - nodeStart) / perNode) * 100);
    return { name: n.name || n, percent: clampPercent(pct) };
  });
}

export function transformOrderData(r) {
  if (!r) return r;
  const source = { ...r };
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
  } else if (source.coverImage) {
    styleCoverUrl = getAuthedImageUrl(source.coverImage);
  } else if (source.styleImage) {
    styleCoverUrl = getAuthedImageUrl(source.styleImage);
  }
  const totalQuantity = colorGroups.length > 0
    ? colorGroups.reduce((sum, g) => sum + g.total, 0)
    : sizeMeta.sizeTotal;
  const completedQuantity = Number(source.completedQuantity) || 0;
  const remainQuantity = Math.max(0, totalQuantity - completedQuantity);
  const processNodes = buildProcessNodes(source);
  const calculatedProgress = calcOrderProgress(source);
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
    completedQuantity,
    remainQuantity,
    processNodes,
    calculatedProgress,
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

export {
  normalizeText, isClosedStatus, buildSizeMeta, buildColorSizeMeta,
  calcDeliveryInfo, mapUrgencyLabel, mapPlateTypeLabel, mapFactoryTypeLabel,
  orderStatusText, parseProductionOrderLines, sortSizes, SIZE_ORDER,
};
