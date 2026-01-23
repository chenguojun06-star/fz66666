
/**
 * 订单解析工具
 * 
 * 用于处理后端返回的生产订单数据，特别是解析 orderDetails JSON 字符串
 * 确保前端能获取到统一的 SKU 明细列表 (items)
 */

function toNumberSafe(val) {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/**
 * 解析订单明细
 * @param {Object} order - 订单对象
 * @returns {Array} SKU明细列表 [{color, size, quantity}]
 */
function parseProductionOrderLines(order) {
  if (!order) return [];

  // 1. 尝试从 orderDetails 解析
  let detailsRaw = order.orderDetails;
  let parsed = null;

  if (detailsRaw != null && String(detailsRaw).trim()) {
    try {
      parsed = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
    } catch (e) {
      console.warn('[OrderParser] JSON解析失败:', e);
      parsed = null;
    }
  }

  // 2. 寻找列表数组
  let list = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    // 兼容多种字段名
    const candidate = parsed.lines || parsed.items || parsed.details || parsed.list || parsed.orderLines;
    if (Array.isArray(candidate)) {
      list = candidate;
    } else {
      // 可能是单个对象
      list = [parsed];
    }
  }

  // 3. 标准化每一行
  const normalizeLine = (r) => {
    // 兼容各种可能的字段名 (中英文)
    const color = String(r.color || r.colour || r.colorName || r['颜色'] || '').trim();
    const size = String(r.size || r.sizeName || r.spec || r.尺码 || r['尺码'] || '').trim();
    
    // 数量字段
    const quantity = toNumberSafe(r.quantity || r.qty || r.count || r.num || r['数量']);

    return { color, size, quantity };
  };

  const normalized = list
    .map(normalizeLine)
    .filter(l => {
      // 过滤无效行：必须有颜色或尺码，且数量>0
      if (!l.color || !l.size) return false;
      return l.quantity > 0;
    });

  if (normalized.length > 0) {
    return normalized;
  }

  // 4. 兜底逻辑：如果解析不出列表，尝试使用订单顶层的 color/size/quantity
  const fallbackColor = String(order.color || '').trim();
  const fallbackSize = String(order.size || '').trim();
  const fallbackQty = toNumberSafe(order.orderQuantity || order.quantity);

  if (fallbackColor && fallbackSize && fallbackQty > 0) {
    return [{
      color: fallbackColor,
      size: fallbackSize,
      quantity: fallbackQty
    }];
  }

  return [];
}

module.exports = {
  parseProductionOrderLines
};
