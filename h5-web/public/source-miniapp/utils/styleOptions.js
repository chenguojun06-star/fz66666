/**
 * 智能切分款式码数/颜色字符串（PC 端 frontend/src/utils/styleOptions.ts 的 1:1 JS 复刻）
 *
 * ★ 为什么不能用 value.split(/[/,，\s]+/)：
 *   码数内部常含 "/"（如 "L(170/84)"、"XS(155/72A)"），无脑按 "/" 切会被切成
 *   "L(170" + "84)" 两个碎片，导致下单页码数从 6 个显示成 16 个。
 *   反过来，只按 "," 切（旧小程序实现）则旧 "/"-拼接数据整个变成一个长码数，
 *   页面上显示成一坨（用户截图反馈的根因）。
 *
 * ★ 切分策略：
 *   1. 优先按标准分隔符（逗号/中文逗号/顿号/空白）切分——这些字符
 *      绝不出现在码数内部，可以无脑切。
 *   2. 退化路径：旧数据用 "/" 拼接，必须按括号外的 "/" 切，跳过括号内的 "/"。
 *      - "L(170/84)/XL(175/88)" → ["L(170/84)", "XL(175/88)"] ✓
 *      - "XS/S/M"（无括号）     → ["XS", "S", "M"] ✓
 *
 * ★ 兼容性：同时兼容旧 "/" 拼接数据和新 "," 拼接数据，已有款式无需迁移。
 */
function splitStyleOptions(value) {
  if (!value) return [];
  const text = String(value).trim();
  if (!text) return [];

  // 优先按标准分隔符切
  if (/[,，、\s]/.test(text)) {
    return text
      .split(/[,，、\s]+/)
      .map(function (v) { return v.trim(); })
      .filter(Boolean);
  }

  // 退化：旧数据用 "/" 拼接，按括号外的 "/" 智能切
  const result = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth = depth > 0 ? depth - 1 : 0;
      current += ch;
    } else if (ch === '/' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/**
 * 合并多组选项并去重（大小写/空格归一化后判重），保持首次出现顺序
 * 对应 PC 端 orderFormHelpers.mergeDistinctOptions
 */
function mergeDistinctOptions() {
  const result = [];
  const seen = {};
  for (let g = 0; g < arguments.length; g++) {
    const group = arguments[g] || [];
    for (let i = 0; i < group.length; i++) {
      const text = String(group[i] || '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      result.push(text);
    }
  }
  return result;
}

module.exports = { splitStyleOptions, mergeDistinctOptions };
