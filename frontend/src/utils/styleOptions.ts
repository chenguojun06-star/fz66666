/**
 * 智能切分款式码数/颜色字符串
 *
 * ★ 为什么不能用 `value.split(/[/,，\s]+/)`：
 *   旧实现把 "/" 当分隔符，但码数内部常含 "/"（如 "L(170/84)"、
 *   "XS(155/72A)"），会被切成 "L(170" + "84)" 两个碎片，导致
 *   下单页码数从 6 个显示成 16 个（用户反馈"开发码 16"根因）。
 *
 * ★ 切分策略：
 *   1. 优先按标准分隔符（逗号/中文逗号/顿号/空白）切分——这些字符
 *      绝不出现在码数内部，可以无脑切。
 *   2. 退化路径：旧数据用 "/" 拼接（buildSizeString 旧实现）。
 *      必须按括号外的 "/" 切，跳过括号内的 "/"。
 *      - "L(170/84)/XL(175/88)" → ["L(170/84)", "XL(175/88)"] ✓
 *      - "XS/S/M"（无括号）→ ["XS", "S", "M"] ✓
 *
 * ★ 兼容性：同时兼容旧 "/" 拼接数据和新 "," 拼接数据，已有款式无需迁移。
 */
export function splitStyleOptions(value?: string | null): string[] {
  if (!value) return [];
  const text = String(value).trim();
  if (!text) return [];

  // 优先按标准分隔符切
  if (/[,，、\s]/.test(text)) {
    return text
      .split(/[,，、\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  // 退化：旧数据用 "/" 拼接，按括号外的 "/" 智能切
  const result: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
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
