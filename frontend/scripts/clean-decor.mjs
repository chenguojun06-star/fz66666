#!/usr/bin/env node
/**
 * 装饰动画清理（第 2 批）
 *
 * 用法：node frontend/scripts/clean-decor.mjs [--apply]
 *
 * 只关停"纯装饰"动画 —— 为动而动、不承载信息：
 *   闪烁告警、霓虹光晕、扫描线、边框呼吸、闪灯、浮动、光晕呼吸
 *
 * 明确保留（承载信息，属功能性）：
 *   shimmer（骨架屏加载）、blink-cursor（打字机光标）、spin/rotate（loading）、
 *   progress（进度）、pulse-dot（Agent 运行中状态指示）
 *
 * 安全：打印文件整文件跳过；@media print 块内跳过。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const CWD = process.cwd();

const DECOR_ANIM = [
  // IntelligenceCenter「驾驶舱」
  'blink-alert', 'live-dot-pulse', 'scan-top', 'neon-pulse-cyan', 'neon-pulse-green',
  'danger-border-pulse', 'warn-border-pulse', 'dot-warn-blink',
  'breathe-cyan', 'breathe-red', 'breathe-green', 'lsf-pulse', 'clock-tick',
  // 其他页面
  'glowBreath', 'floatSoft', 'stagnant-badge-pulse', 'stagnant-dot-blink',
  'sab-dot-pulse', 'floatAvatar', 'float-zzz',
];
const KEEP = /shimmer|blink-cursor|spin|rotate|progress|pulse-dot|loading/i;

const PRINT_PATTERN = /print|label|wash|barcode|sticker|quotation|certificate/i;

function extractPrintBlocks(text) {
  const holes = [];
  let out = '', i = 0;
  const marker = '@media print';
  while (i < text.length) {
    const idx = text.indexOf(marker, i);
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

let totalAnim = 0, totalKf = 0;
const touched = [];

for (const rel of files) {
  if (PRINT_PATTERN.test(rel)) continue;
  const abs = join(CWD, rel);
  const { safe, holes } = extractPrintBlocks(readFileSync(abs, 'utf8'));
  let animN = 0, kfN = 0;
  let next = safe;

  // 1) 删引用：整行只有一条 animation 声明的规则 → 删整行；否则只删该声明
  next = next
    .replace(/^[ \t]*\.[A-Za-z0-9_-]+\s*\{\s*animation:\s*([\w-]+)[^;]*;\s*\}\r?\n/gm, (m, name) => {
      if (!DECOR_ANIM.includes(name) || KEEP.test(name)) return m;
      animN++;
      return '';
    })
    .replace(/^[ \t]*animation:\s*([\w-]+)[^;]*;\r?\n/gm, (m, name) => {
      if (!DECOR_ANIM.includes(name) || KEEP.test(name)) return m;
      animN++;
      return '';
    })
    .replace(/^[ \t]*animation-name:\s*([\w-]+)\s*;\r?\n/gm, (m, name) => {
      if (!DECOR_ANIM.includes(name) || KEEP.test(name)) return m;
      animN++;
      return '';
    });

  // 2) 删 @keyframes 定义（只删装饰动画自己的）
  for (const name of DECOR_ANIM) {
    const re = new RegExp(`@keyframes\\s+${name}\\s*\\{[\\s\\S]*?\\n\\}\\n?`, 'g');
    next = next.replace(re, () => { kfN++; return ''; });
  }

  if (!animN && !kfN) continue;
  totalAnim += animN; totalKf += kfN;
  touched.push({ rel, animN, kfN });
  if (APPLY) writeFileSync(abs, restore(next, holes), 'utf8');
}

console.log(`\n${APPLY ? '已写入' : '空跑'} · 文件 ${touched.length} 个 ｜ 关停动画 ${totalAnim} 处 ｜ 删除 @keyframes ${totalKf} 个\n`);
for (const t of touched.sort((a, b) => (b.animN + b.kfN) - (a.animN + a.kfN))) {
  console.log(`  ${String(t.animN + t.kfN).padStart(3)}  ${t.rel}  (引用${t.animN} 定义${t.kfN})`);
}
if (!APPLY) console.log('\n确认后加 --apply\n');
