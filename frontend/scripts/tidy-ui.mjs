#!/usr/bin/env node
/**
 * UI 工整化批量处理（第 1 批：字号 + 圆角）
 *
 * 用法：
 *   node frontend/scripts/tidy-ui.mjs          # 空跑，只看会改多少、改哪些文件
 *   node frontend/scripts/tidy-ui.mjs --apply  # 真正写入
 *
 * 安全规则：
 *   1. 打印相关文件整文件跳过（路径含 print/label/wash/barcode/sticker/quotation/certificate）
 *   2. @media print { ... } 块内跳过（打印字体一旦改动会导致打印排版错乱/字体丢失）
 *   3. 图标字号（>=18px）不动 —— 多为 iconfont 图标尺寸，不是文本字号
 *   4. border-radius: 50% / 999px 不动（头像、圆点、状态标签），且本方案不新增胶囊按钮
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const SRC = join(process.cwd(), 'frontend/src');

// 字号：13 档 → 5 档（12 / 13 / 14 / 16 / 20），18px+ 不动（图标/大标题属设计意图）
const FONT_MAP = { '7': '12', '8': '12', '9': '12', '10': '12', '11': '12', '15': '14' };
// 圆角：7 种 → 3 档（4 控件 / 6 小卡片 / 8 卡片弹窗）
const RADIUS_MAP = { '2': '4', '3': '4', '10': '8', '12': '8', '16': '8', '20': '8' };

const PRINT_PATTERN = /print|label|wash|barcode|sticker|quotation|certificate/i;

const files = execSync(
  'find frontend/src -name "*.css" -type f',
  { encoding: 'utf8', cwd: process.cwd() }
).trim().split('\n').filter(Boolean);

/** 把 @media print { ... } 块整体挖掉，返回 { safe, holes } */
function extractPrintBlocks(text) {
  const holes = [];
  let out = '';
  let i = 0;
  const marker = '@media print';
  while (i < text.length) {
    const idx = text.indexOf(marker, i);
    if (idx === -1) { out += text.slice(i); break; }
    out += text.slice(i, idx);
    // 找到块的起始 {
    let braceStart = text.indexOf('{', idx);
    if (braceStart === -1) { out += text.slice(idx); break; }
    let depth = 0;
    let j = braceStart;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    const block = text.slice(idx, j);
    holes.push(block);
    out += `\u0000PRINTBLOCK${holes.length - 1}\u0000`;
    i = j;
  }
  return { safe: out, holes };
}

function restorePrintBlocks(text, holes) {
  return text.replace(/\u0000PRINTBLOCK(\d+)\u0000/g, (_, n) => holes[Number(n)]);
}

let totalFont = 0, totalRadius = 0;
const touched = [];

for (const rel of files) {
  if (PRINT_PATTERN.test(rel)) continue; // 安全规则 1：打印文件整文件跳过
  const abs = join(process.cwd(), rel);
  const original = readFileSync(abs, 'utf8');
  const { safe, holes } = extractPrintBlocks(original);

  let fontN = 0, radiusN = 0;

  let next = safe.replace(/font-size:\s*(\d+)px/g, (m, n) => {
    const t = FONT_MAP[n];
    if (!t) return m;
    fontN++;
    return `font-size: ${t}px`;
  });

  next = next.replace(/border-radius:(\s*)([^;]+);/g, (m, sp, val) => {
    const nv = val.replace(/(\d+)px/g, (mm, n) => {
      const t = RADIUS_MAP[n];
      if (!t) return mm;
      radiusN++;
      return `${t}px`;
    });
    return `border-radius:${sp}${nv};`;
  });

  if (!fontN && !radiusN) continue;

  const final = restorePrintBlocks(next, holes);
  totalFont += fontN;
  totalRadius += radiusN;
  touched.push({ rel, fontN, radiusN });
  if (APPLY) writeFileSync(abs, final, 'utf8');
}

console.log(`\n${APPLY ? '已写入' : '空跑'} · 文件 ${touched.length} 个 ｜ 字号 ${totalFont} 处 ｜ 圆角 ${totalRadius} 处\n`);
for (const t of touched.sort((a, b) => (b.fontN + b.radiusN) - (a.fontN + a.radiusN))) {
  console.log(`  ${String(t.fontN + t.radiusN).padStart(4)}  ${t.rel}  (字号${t.fontN} 圆角${t.radiusN})`);
}
if (!APPLY) console.log(`\n确认无误后加 --apply 执行\n`);
