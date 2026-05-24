var { sortSizeNames } = require('../../../utils/sizeUtils');

function toNumberSafe(val) {
  if (val === null || val === undefined) return 0;
  var n = Number(val);
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
    var candidate = parsed.lines || parsed.items || parsed.details || parsed.list || parsed.orderLines;
    return Array.isArray(candidate) ? candidate : [parsed];
  }
  return [];
}

function normalizeOrderLine(r) {
  var color = String(r.color || r.colour || r.colorName || r['颜色'] || '').trim();
  var size = String(r.size || r.sizeName || r.spec || r.尺码 || r['尺码'] || '').trim();
  var quantity = toNumberSafe(r.quantity || r.qty || r.count || r.num || r['数量']);
  return { color: color, size: size, quantity: quantity };
}

function isValidLine(line) {
  return line.color && line.size && line.quantity > 0;
}

function extractFallbackLine(order) {
  var color = String(order.color || '').trim();
  var size = String(order.size || '').trim();
  var quantity = toNumberSafe(order.orderQuantity || order.quantity);
  if (color && size && quantity > 0) return [{ color: color, size: size, quantity: quantity }];
  return [];
}

function parseProductionOrderLines(order) {
  if (!order) return [];
  var parsed = parseOrderDetailsJSON(order.orderDetails);
  var list = extractListArray(parsed);
  var normalized = list.map(normalizeOrderLine).filter(isValidLine);
  if (normalized.length > 0) return normalized;
  return extractFallbackLine(order);
}

module.exports = {
  parseProductionOrderLines: parseProductionOrderLines,
  sortSizeNames: sortSizeNames,
};