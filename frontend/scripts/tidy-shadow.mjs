#!/usr/bin/env node
/**
 * 阴影收敛：硬编码 box-shadow → 6 级 token（xs / sm / base / md / lg / xl）
 *
 * 用法：node frontend/scripts/tidy-shadow.mjs [--apply]
 *
 * 背景：design-system 里 --shadow-xs..xl 六级已定义完整（深色主题下还有另一套值），
 * 但全站 226 处 box-shadow 里只有约 31 处用了 token，其余是硬编码。
 *
 * 按模糊半径映射：
 *   blur <=2 → xs   3-6 → sm   7-12 → md   13-24 → lg   >24 → xl
 *
 * 跳过（这些有明确意图，改了反而错）：
 *   - none / none !important（26 处，明确不要阴影）
 *   - inset（8 处，内凹效果，功能性）
 *   - 已经是 var(--shadow*) 的
 *
 * 彩色发光阴影（41 处，如 rgba(0,229,255,...) 青色光晕）一并改中性 —— 这正是要去掉的装饰。
 *
 * 安全：打印/标签相关文件整文件跳过；@media print 块内跳过。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const CWD = process.cwd();
const PRINT_PATTERN = /print|label|wash|barcode|sticker|quotation|certificate/i;

function extractPrintBlocks(text) {
  const holes = [];
  let out = '', i = 0;
  while (i < text.length) {
    const idx = text.indexOf('@media print', i);
    if (idx === -1) { out += text.slice(i); break; }
    out += text.slice(i, idx);
    const bs = text.indexOf('{', idx);
    if (bs === -1) { out += text.slice(idx); break; }
    let depth = 0, j = bs;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    holes.push(text.slice(idx, j));
    out += `\u0000PB${holes.length - 1}\u0000`;
    i = j;
  }
  return { safe: out, holes };
}
const restore = (t, h) => t.replace(/\u0000PB(\d+)\u0000/g, (_, n) => h[+n]);

function pickToken(blur) {
  if (blur <= 2) return '--shadow-xs';
  if (blur <= 6) return '--shadow-sm';
  if (blur <= 12) return '--shadow-md';
  if (blur <= 24) return '--shadow-lg';
  return '--shadow-xl';
}

const files = execSync('find frontend/src -name "*.css" -type f', { encoding: 'utf8', cwd: CWD })
  .trim().split('\n').filter(Boolean);

let total = 0, colored = 0;
const touched = [];
const dist = {};

for (const rel of files) {
  if (PRINT_PATTERN.test(rel)) continue;
  const abs = join(CWD, rel);
  const { safe, holes } = extractPrintBlocks(readFileSync(abs, 'utf8'));
  let n = 0;

  const next = safe.replace(/box-shadow:(\s*)([^;]+);/g, (m, sp, val) => {
    const v = val.trim();
    if (/^none/i.test(v)) return m;          // 明确不要阴影
    if (/^inset/i.test(v)) return m;          // 内凹，功能性
    if (/^var\(--shadow/.test(v)) return m;   // 已用 token

    // 取第一个阴影的模糊半径（第 3 个长度）。注意 CSS 里 0 可以不带单位：0 2px 8px
    const lm = v.match(/(-?[\d.]+)(?:px)?\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
    if (!lm) return m;
    const blur = parseFloat(lm[3]);

    // 彩色发光检测：rgba 三通道不完全相等 = 非灰阶
    const cm = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    const isColored = cm && !(cm[1] === cm[2] && cm[2] === cm[3]);
    if (isColored) colored++;

    const tk = pickToken(blur);
    dist[tk] = (dist[tk] || 0) + 1;
    n++;
    return `box-shadow:${sp}var(${tk});`;
  });

  if (!n) continue;
  total += n;
  touched.push({ rel, n });
  if (APPLY) writeFileSync(abs, restore(next, holes), 'utf8');
}

console.log(`\n${APPLY ? '已写入' : '空跑'} · 文件 ${touched.length} 个 ｜ 阴影 ${total} 处（含彩色发光 ${colored} 处）\n`);
console.log('映射分布：');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v} 处`);
console.log('\n改动最多：');
for (const t of touched.sort((a, b) => b.n - a.n).slice(0, 8)) console.log(`  ${String(t.n).padStart(3)}  ${t.rel}`);
if (!APPLY) console.log('\n确认后加 --apply\n');
