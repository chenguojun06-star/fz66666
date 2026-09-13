#!/usr/bin/env node
/**
 * 野值收尾：清理第 1 批映射表没覆盖到的边角值
 *
 * 用法：node frontend/scripts/tidy-leftover.mjs [--apply]
 *
 * 与 tidy-ui / tidy-spacing 的分工：
 *   前两批处理的是"高频野值"（出现几十到几百次），本脚本处理"长尾野值"
 *   （每个值只出现几次，但同样破坏一致性）。
 *
 * 映射（一律就近向下取整，宁可略紧也不撑破布局）：
 *   圆角  14/15/18 → 8    5 → 4
 *   间距  18 → 16   22 → 20   26/28 → 24   36 → 32
 *
 * 明确保留（不动）：
 *   - 字号：含 font-size:0 / inherit / 9pt 等特殊值，9pt 是打印单位，碰不得
 *   - 间距 ≥ 40px 与 clamp()：属布局级间距，不是"控件间距"，强行收敛会破坏版式
 *   - 打印/标签相关文件、@media print 块
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const CWD = process.cwd();
const PRINT_PATTERN = /print|label|wash|barcode|sticker|quotation|certificate/i;

const RADIUS_MAP = { '5': '4', '14': '8', '15': '8', '18': '8' };
const SPACING_MAP = { '18': '16', '22': '20', '26': '24', '28': '24', '36': '32' };
const SPACING_SKIP_GE = 40;

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

let rN = 0, sN = 0;
const touched = [];

for (const rel of files) {
  if (PRINT_PATTERN.test(rel)) continue;
  const abs = join(CWD, rel);
  const { safe, holes } = extractPrintBlocks(readFileSync(abs, 'utf8'));
  let a = 0, b = 0;

  let next = safe.replace(/border-radius:(\s*)([^;]+);/g, (m, sp, val) => {
    if (/50%|999px|var\(/.test(val)) return m;
    const nv = val.replace(/(\d+)px/g, (mm, d) => {
      const t = RADIUS_MAP[d];
      if (!t) return mm;
      a++;
      return `${t}px`;
    });
    return nv === val ? m : `border-radius:${sp}${nv};`;
  });

  next = next.replace(
    /\b(padding|margin|gap|row-gap|column-gap)(-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?(\s*):(\s*)([^;]+);/g,
    (m, prop, dir, s1, s2, val) => {
      if (/clamp\(|var\(|calc\(/.test(val)) return m;
      let skip = false;
      for (const mm of val.matchAll(/(\d+)px/g)) {
        if (parseInt(mm[1], 10) >= SPACING_SKIP_GE) skip = true;
      }
      if (skip) return m;
      const nv = val.replace(/(\d+)px/g, (mm, d) => {
        const t = SPACING_MAP[d];
        if (!t) return mm;
        b++;
        return `${t}px`;
      });
      return nv === val ? m : `${prop}${dir || ''}${s1}:${s2}${nv};`;
    }
  );

  if (!a && !b) continue;
  rN += a; sN += b;
  touched.push({ rel, a, b });
  if (APPLY) writeFileSync(abs, restore(next, holes), 'utf8');
}

console.log(`\n${APPLY ? '已写入' : '空跑'} · 文件 ${touched.length} 个 ｜ 圆角 ${rN} 处 ｜ 间距 ${sN} 处\n`);
for (const t of touched.sort((x, y) => (y.a + y.b) - (x.a + x.b))) {
  console.log(`  ${String(t.a + t.b).padStart(3)}  ${t.rel}  (圆角${t.a} 间距${t.b})`);
}
if (!APPLY) console.log('\n确认后加 --apply\n');
