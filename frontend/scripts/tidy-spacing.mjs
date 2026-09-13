#!/usr/bin/env node
/**
 * 间距收敛：649 处野值 → 8pt 网格（4 / 8 / 12 / 16 / 20 / 24 / 32 / 40）
 *
 * 用法：node frontend/scripts/tidy-spacing.mjs [--apply]
 *
 * 只改 padding / margin / gap，绝不动 width / height / border / font-size ——
 * 改尺寸会直接撑破布局，改间距最多是疏密变化。
 *
 * 映射（就近向上取整到标准档，整体间距略变宽松）：
 *   3,5 → 4     6,7,9 → 8     10,11 → 12     13,14 → 16
 * 已是标准档的 4/8/12/16/20/24/32/40 原样不动。
 *
 * 安全：打印/标签相关文件整文件跳过；@media print 块内跳过。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const CWD = process.cwd();

const SPACING_MAP = {
  '3': '4', '5': '4',
  '6': '8', '7': '8', '9': '8',
  '10': '12', '11': '12',
  '13': '16', '14': '16',
};
const STANDARD = new Set(['4', '8', '12', '16', '20', '24', '32', '40']);
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

const files = execSync('find frontend/src -name "*.css" -type f', { encoding: 'utf8', cwd: CWD })
  .trim().split('\n').filter(Boolean);

// 只匹配 padding / margin / gap（含方向后缀），不动 width/height/border 等
const DECL = /\b(padding|margin|gap|row-gap|column-gap)(-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?(\s*):(\s*)([^;]+);/g;

let total = 0;
const touched = [];
const perValue = {};

for (const rel of files) {
  if (PRINT_PATTERN.test(rel)) continue;
  const abs = join(CWD, rel);
  const { safe, holes } = extractPrintBlocks(readFileSync(abs, 'utf8'));
  let n = 0;

  const next = safe.replace(DECL, (m, prop, dir, s1, s2, val) => {
    const nv = val.replace(/(\d+)px/g, (mm, d) => {
      if (STANDARD.has(d)) return mm;
      const t = SPACING_MAP[d];
      if (!t) return mm;
      n++;
      perValue[d] = (perValue[d] || 0) + 1;
      return `${t}px`;
    });
    return nv === val ? m : `${prop}${dir || ''}${s1}:${s2}${nv};`;
  });

  if (!n) continue;
  total += n;
  touched.push({ rel, n });
  if (APPLY) writeFileSync(abs, restore(next, holes), 'utf8');
}

console.log(`\n${APPLY ? '已写入' : '空跑'} · 文件 ${touched.length} 个 ｜ 间距 ${total} 处\n`);
console.log('野值分布：');
for (const [k, v] of Object.entries(perValue).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}px → ${SPACING_MAP[k]}px   ${v} 处`);
}
console.log('\n改动最多：');
for (const t of touched.sort((a, b) => b.n - a.n).slice(0, 10)) {
  console.log(`  ${String(t.n).padStart(4)}  ${t.rel}`);
}
if (!APPLY) console.log('\n确认后加 --apply\n');
