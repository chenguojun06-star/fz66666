const { sortSizeNames } = require('../../../utils/sizeUtils');

function toNumberSafe(val) {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function parseOrderDetailsJSON(detailsRaw) {
  if (!detailsRaw || !String(detailsRaw).trim()) return null;
  try {
    return typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
  } catch (e) { return null; }
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
  const color = String(r.color || r.colour || r.colorName || r['颜色'] || '').trim();
  const size = String(r.size || r.sizeName || r.spec || r.尺码 || r['尺码'] || '').trim();
  const quantity = toNumberSafe(r.quantity || r.qty || r.count || r.num || r['数量']);
  return { color: color, size: size, quantity: quantity };
}

function isValidLine(line) {
  return line.color && line.size && line.quantity > 0;
}

function extractFallbackLine(order) {
  const color = String(order.color || '').trim();
  const size = String(order.size || '').trim();
  const quantity = toNumberSafe(order.orderQuantity || order.quantity);
  if (color && size && quantity > 0) return [{ color: color, size: size, quantity: quantity }];
  return [];
}

function parseProductionOrderLines(order) {
  if (!order) return [];
  const parsed = parseOrderDetailsJSON(order.orderDetails);
  const list = extractListArray(parsed);
  const normalized = list.map(normalizeOrderLine).filter(isValidLine);
  if (normalized.length > 0) return normalized;
  return extractFallbackLine(order);
}

module.exports = {
  parseProductionOrderLines: parseProductionOrderLines,
  sortSizeNames: sortSizeNames,
};
