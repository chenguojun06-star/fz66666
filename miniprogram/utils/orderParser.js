/**
 * 订单解析工具
 *
 * 用于处理后端返回的生产订单数据，特别是解析 orderDetails JSON 字符串
 * 确保前端能获取到统一的 SKU 明细列表 (items)
 */

function toNumberSafe(val) {
  if (val === null || val === undefined) {
    return 0;
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/**
 * 解析 orderDetails JSON
 */
function parseOrderDetailsJSON(detailsRaw) {
  if (!detailsRaw || !String(detailsRaw).trim()) {
    return null;
  }
  try {
    return typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
  } catch (e) {
    console.warn('[OrderParser] JSON解析失败:', e);
    return null;
  }
}

/**
 * 从解析结果中提取列表数组
 */
function extractListArray(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    const candidate =
      parsed.lines || parsed.items || parsed.details || parsed.list || parsed.orderLines;
    return Array.isArray(candidate) ? candidate : [parsed];
  }
  return [];
}

/**
 * 标准化单个订单明细行
 */
function normalizeOrderLine(r) {
  const color = String(r.color || r.colour || r.colorName || r['颜色'] || '').trim();
  const size = String(r.size || r.sizeName || r.spec || r.尺码 || r['尺码'] || '').trim();
  const quantity = toNumberSafe(r.quantity || r.qty || r.count || r.num || r['数量']);
  return { color, size, quantity };
}

/**
 * 验证明细行是否有效
 */
function isValidLine(line) {
  return line.color && line.size && line.quantity > 0;
}

/**
 * 从订单顶层提取兜底数据
 */
function extractFallbackLine(order) {
  const color = String(order.color || '').trim();
  const size = String(order.size || '').trim();
  const quantity = toNumberSafe(order.orderQuantity || order.quantity);

  if (color && size && quantity > 0) {
    return [{ color, size, quantity }];
  }
  return [];
}

/**
 * 解析订单明细
 * @param {Object} order - 订单对象
 * @returns {Array} SKU明细列表 [{color, size, quantity}]
 */
function parseProductionOrderLines(order) {
  if (!order) {
    return [];
  }

  // 1. 解析 JSON
  const parsed = parseOrderDetailsJSON(order.orderDetails);

  // 2. 提取列表
  const list = extractListArray(parsed);

  // 3. 标准化并过滤
  const normalized = list.map(normalizeOrderLine).filter(isValidLine);

  if (normalized.length > 0) {
    return normalized;
  }

  // 4. 兜底逻辑
  return extractFallbackLine(order);
}

module.exports = {
  parseProductionOrderLines,
};
