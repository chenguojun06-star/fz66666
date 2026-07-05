/**
 * SKU 矩阵数据结构适配层（P1-5）
 *
 * 背景：
 *   小程序/H5 三端 SKU 矩阵数据源结构不一致，但都最终渲染为「颜色×尺码」表格。
 *   本文件提供统一适配函数，把各种源结构转换为 sku-matrix 组件所需的标准格式。
 *   不修改 sku-matrix 组件本身，也不强制改写各页面的内联渲染（避免额外重构）。
 *
 * sku-matrix 组件标准格式（components/sku-matrix/index.js）：
 *   {
 *     sizes: ['S', 'M', 'L'],
 *     rows: [
 *       { color: '红色', cells: [{ size: 'S', quantity: 1 }, { size: 'M', quantity: 2 }, ...] }
 *     ]
 *   }
 *
 * 已知源格式：
 *   1. matrixRows 格式（pattern 页）：{ matrixSizes, matrixRows: [{ color, quantities: [1,2,3], rowTotal }] }
 *   2. quantities 格式（order-detail 页）：{ sizes, rows: [{ label, quantities: [1,2,3], rowTotal }] }
 *   3. colorGroups 格式（order-detail 页另一字段）：{ colorGroups: [{ color, sizeMap: {S:1,M:2}, total }], allSizes }
 *   4. map 格式（bundle-detail 页内部）：{ matrix: { 红色: {S:1,M:2} }, sizes: ['S','M'] }
 *   5. flatList 格式（通用）：[{ color, size, quantity }]
 *
 * 使用方式：
 *   const skuMatrixAdapter = require('../../../utils/skuMatrixAdapter');
 *   const model = skuMatrixAdapter.toSkuMatrixModel(source, 'matrixRows');
 *   <sku-matrix size-matrix="{{model}}" mode="compact" />
 */

/**
 * 主入口：按 format 提示转换源数据为 sku-matrix 组件标准格式
 * @param {Object|Array} source 源数据
 * @param {string} [format] 源格式提示：'matrixRows' | 'quantities' | 'colorGroups' | 'map' | 'flat'
 *                          不传则自动探测
 * @returns {{ sizes: string[], rows: Array<{color: string, cells: Array<{size:string,quantity:number}>}> }}
 */
function toSkuMatrixModel(source, format) {
  if (!source) return { sizes: [], rows: [] };
  const fmt = format || autoDetect(source);
  switch (fmt) {
    case 'matrixRows': return fromMatrixRows(source);
    case 'quantities': return fromQuantitiesRows(source);
    case 'colorGroups': return fromColorGroups(source);
    case 'map': return fromMap(source);
    case 'flat': return fromFlatList(source);
    default: return { sizes: [], rows: [] };
  }
}

function autoDetect(source) {
  if (Array.isArray(source)) return 'flat';
  if (Array.isArray(source.matrixRows)) return 'matrixRows';
  if (Array.isArray(source.colorGroups)) return 'colorGroups';
  if (source.matrix && typeof source.matrix === 'object') return 'map';
  if (Array.isArray(source.rows) && source.rows[0] && Array.isArray(source.rows[0].quantities)) return 'quantities';
  if (Array.isArray(source.rows) && source.rows[0] && Array.isArray(source.rows[0].cells)) return 'quantities';
  return 'quantities';
}

/** 1. matrixRows 格式 → 标准 */
function fromMatrixRows(source) {
  const sizes = Array.isArray(source.matrixSizes || source.sizes) ? (source.matrixSizes || source.sizes) : [];
  const rows = (Array.isArray(source.matrixRows) ? source.matrixRows : []).map(function (r) {
    const quantities = Array.isArray(r.quantities) ? r.quantities : [];
    return {
      color: r.color || r.label || '',
      cells: sizes.map(function (size, idx) {
        return { size: size, quantity: Number(quantities[idx] || 0) };
      }),
    };
  });
  return { sizes: sizes, rows: rows };
}

/** 2. quantities 格式 → 标准（兼容 cells 字段） */
function fromQuantitiesRows(source) {
  const sizes = Array.isArray(source.sizes) ? source.sizes : [];
  const rows = (Array.isArray(source.rows) ? source.rows : []).map(function (r) {
    // 已是 cells 格式直接返回
    if (Array.isArray(r.cells)) {
      return { color: r.color || r.label || '', cells: r.cells };
    }
    const quantities = Array.isArray(r.quantities) ? r.quantities : [];
    return {
      color: r.color || r.label || '',
      cells: sizes.map(function (size, idx) {
        return { size: size, quantity: Number(quantities[idx] || 0) };
      }),
    };
  });
  return { sizes: sizes, rows: rows };
}

/** 3. colorGroups 格式 → 标准 */
function fromColorGroups(source) {
  const sizes = Array.isArray(source.allSizes || source.sizes) ? (source.allSizes || source.sizes) : [];
  const groups = Array.isArray(source.colorGroups) ? source.colorGroups : [];
  const rows = groups.map(function (g) {
    const sizeMap = g.sizeMap || {};
    return {
      color: g.color || '',
      cells: sizes.map(function (size) {
        return { size: size, quantity: Number(sizeMap[size] || 0) };
      }),
    };
  });
  return { sizes: sizes, rows: rows };
}

/** 4. map 格式 → 标准（bundle-detail 内部用） */
function fromMap(source) {
  const sizes = Array.isArray(source.sizes) ? source.sizes : [];
  const matrix = source.matrix || {};
  const rows = Object.keys(matrix).map(function (color) {
    const sizeQty = matrix[color] || {};
    return {
      color: color,
      cells: sizes.map(function (size) {
        return { size: size, quantity: Number(sizeQty[size] || 0) };
      }),
    };
  });
  return { sizes: sizes, rows: rows };
}

/** 5. flat 列表 → 标准 */
function fromFlatList(list) {
  if (!Array.isArray(list) || list.length === 0) return { sizes: [], rows: [] };
  const sizeSet = [];
  const colorMap = {};
  list.forEach(function (item) {
    const color = String(item.color || '').trim() || '默认';
    const size = String(item.size || '').trim() || '均码';
    const qty = Number(item.quantity || 0);
    if (sizeSet.indexOf(size) === -1) sizeSet.push(size);
    if (!colorMap[color]) colorMap[color] = {};
    colorMap[color][size] = (colorMap[color][size] || 0) + qty;
  });
  const rows = Object.keys(colorMap).map(function (color) {
    return {
      color: color,
      cells: sizeSet.map(function (size) {
        return { size: size, quantity: Number(colorMap[color][size] || 0) };
      }),
    };
  });
  return { sizes: sizeSet, rows: rows };
}

module.exports = {
  toSkuMatrixModel: toSkuMatrixModel,
  fromMatrixRows: fromMatrixRows,
  fromQuantitiesRows: fromQuantitiesRows,
  fromColorGroups: fromColorGroups,
  fromMap: fromMap,
  fromFlatList: fromFlatList,
};
