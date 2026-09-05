/**
 * D-304：尺寸表共享工具（scan-result D-185 / order-detail D-252 / components/size-table 三处统一引用）
 * - compareSizeNames：码数排序——含数字的码名（如 S(160/80A)、155）按数字从小到大；
 *   纯字母码按标准码序 XXS→5XL→F；都没有才按字母序（旧实现带括号码名全落字母序会乱）
 * - buildSizeSpec：尺寸表透视，行=部位、列=尺码；每行带度量方式（measureMethod，部位级属性取首个非空）
 */

var STANDARD_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL', 'F', 'OS'];

function firstNumber(s) {
  var m = String(s || '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function compareSizeNames(a, b) {
  var sa = String(a || '');
  var sb = String(b || '');
  var na = firstNumber(sa);
  var nb = firstNumber(sb);
  // 有数字的码（含带括号身高型码）按数字从小到大
  if (na !== null && nb !== null && na !== nb) return na - nb;
  var ia = STANDARD_SIZE_ORDER.indexOf(sa.toUpperCase());
  var ib = STANDARD_SIZE_ORDER.indexOf(sb.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return sa.localeCompare(sb);
}

/**
 * 尺寸表透视。
 * @param rawList 后端 /api/style/size/list 记录（sizeName/baseSize + partName/part + standardValue/value + measureMethod）
 * @param currentSize 可选，当前码数（扫码页高亮用）
 * @returns {sizeCols, rows:[{part, measureMethod, values}], currentIdx} 或 null
 */
function buildSizeSpec(rawList, currentSize) {
  if (!Array.isArray(rawList) || rawList.length === 0) return null;
  var sizeSeen = {};
  var sizeCols = [];
  rawList.forEach(function (it) {
    var sz = (it && (it.sizeName || it.baseSize)) || '';
    if (sz && !sizeSeen[sz]) { sizeSeen[sz] = true; sizeCols.push(sz); }
  });
  if (sizeCols.length === 0) return null;
  sizeCols.sort(compareSizeNames);

  var partSeen = {};
  var parts = [];
  rawList.forEach(function (it) {
    var p = (it && (it.partName || it.part)) || '';
    if (p && !partSeen[p]) { partSeen[p] = true; parts.push(p); }
  });

  var valueMap = {};
  var measureMap = {};
  rawList.forEach(function (it) {
    if (!it) return;
    var p = (it.partName || it.part) || '';
    var sz = (it.sizeName || it.baseSize) || '';
    if (p && sz) {
      valueMap[p + '|' + sz] = it.standardValue != null ? it.standardValue : (it.value != null ? it.value : '-');
    }
    if (p && !measureMap[p] && it.measureMethod) {
      measureMap[p] = it.measureMethod;
    }
  });

  var rows = parts.map(function (p) {
    return {
      part: p,
      measureMethod: measureMap[p] || '',
      values: sizeCols.map(function (sz) { return valueMap[p + '|' + sz] || '-'; }),
    };
  });
  var currentIdx = currentSize ? sizeCols.indexOf(currentSize) : -1;
  return { sizeCols: sizeCols, rows: rows, currentIdx: currentIdx };
}

module.exports = {
  compareSizeNames: compareSizeNames,
  buildSizeSpec: buildSizeSpec,
};
