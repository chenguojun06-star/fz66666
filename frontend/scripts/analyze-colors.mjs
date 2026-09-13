#!/usr/bin/env node
/**
 * 硬编码颜色核实：这些颜色到底是不是"必须的"？
 *
 * 用法：node frontend/scripts/analyze-colors.mjs
 *
 * 输出三类结论：
 *   1. 已有等价 token → 可直接替换（安全收益）
 *   2. 无等价 token 但高频 → 值得新增 token
 *   3. 只出现 1 次 / 图表配色 / 渐变专用 → 保留（改了反而有风险）
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CWD = process.cwd();
const files = execSync('find frontend/src -name "*.css" -type f', { encoding: 'utf8', cwd: CWD })
  .trim().split('\n').filter(Boolean);

// 打印/标签相关：这些文件里的颜色是打印排版的一部分，改动会导致打印异常
const PRINT_PATTERN = /print|label|wash|barcode|sticker|quotation|certificate/i;

// ── 1. 收集 design-system 里已定义的 token（值 → 名称），用于比对 ──
const dsText = readFileSync(join(CWD, 'frontend/src/styles/design-system.css'), 'utf8');
const tokenByValue = new Map();
for (const m of dsText.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/gm)) {
  const v = m[2].toLowerCase();
  if (!tokenByValue.has(v)) tokenByValue.set(v, m[1]);
}
// 主题文件里也定义了一部分
for (const f of ['frontend/src/styles/global.css', 'frontend/src/styles/dark-theme-global.css']) {
  try {
    const t = readFileSync(join(CWD, f), 'utf8');
    for (const m of t.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      const v = m[2].toLowerCase();
      if (!tokenByValue.has(v)) tokenByValue.set(v, m[1]);
    }
  } catch { /* ignore */ }
}

// ── 2. 统计全站硬编码颜色 ──
const hexCount = new Map();   // 色值 → { n, files:Set, print:boolean }
const rgbaCount = new Map();
let total = 0, inPrintFile = 0;

for (const rel of files) {
  const t = readFileSync(join(CWD, rel), 'utf8');
  const isPrint = PRINT_PATTERN.test(rel);
  for (const m of t.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g)) {
    const v = ('#' + m[1]).toLowerCase();
    const e = hexCount.get(v) || { n: 0, files: new Set(), print: false };
    e.n++; e.files.add(rel); e.print = e.print || isPrint;
    hexCount.set(v, e);
    total++;
    if (isPrint) inPrintFile++;
  }
  for (const m of t.matchAll(/rgba?\([^)]*\)/g)) {
    const v = m[0].replace(/\s+/g, '').toLowerCase();
    const e = rgbaCount.get(v) || { n: 0, files: new Set(), print: false };
    e.n++; e.files.add(rel); e.print = e.print || isPrint;
    rgbaCount.set(v, e);
  }
}

const sortedHex = [...hexCount.entries()].sort((a, b) => b[1].n - a[1].n);
const sortedRgba = [...rgbaCount.entries()].sort((a, b) => b[1].n - a[1].n);

console.log(`\n${'='.repeat(72)}`);
console.log(`硬编码颜色核实报告`);
console.log(`${'='.repeat(72)}`);
console.log(`hex 总计 ${total} 处（去重 ${hexCount.size} 个色值）｜ 其中打印/标签相关文件内 ${inPrintFile} 处 → 禁改`);
console.log(`rgba 总计 ${[...rgbaCount.values()].reduce((s, e) => s + e.n, 0)} 处（去重 ${rgbaCount.size} 个）\n`);

console.log(`── 一、可安全替换（已有等价 token，改了值完全不变）────────────`);
let replaceable = 0;
for (const [v, e] of sortedHex) {
  const tk = tokenByValue.get(v);
  if (!tk) continue;
  replaceable += e.n;
  console.log(`  ${String(e.n).padStart(3)}×  ${v.padEnd(10)} → var(${tk})${e.print ? '  ⚠️含打印文件' : ''}`);
}
console.log(`  小计：${replaceable} 处可无损替换\n`);

console.log(`── 二、无等价 token，但高频（值得新增 token）──────────────────`);
let worth = 0;
for (const [v, e] of sortedHex) {
  if (tokenByValue.get(v)) continue;
  if (e.n < 3) continue;
  worth += e.n;
  console.log(`  ${String(e.n).padStart(3)}×  ${v.padEnd(10)}  分布在 ${e.files.size} 个文件${e.print ? '  ⚠️含打印文件' : ''}`);
}
console.log(`  小计：${worth} 处\n`);

console.log(`── 三、长尾（只出现 1-2 次，多为图表/特殊语义，建议保留）──────`);
const tail = sortedHex.filter(([v, e]) => !tokenByValue.get(v) && e.n < 3);
console.log(`  共 ${tail.length} 个色值、${tail.reduce((s, [, e]) => s + e.n, 0)} 处 —— 逐个替换收益低、风险高`);
console.log(`  样例：${tail.slice(0, 12).map(([v]) => v).join(' ')}\n`);

console.log(`── 四、rgba 高频（半透明叠加，多数是"必须的"）─────────────────`);
for (const [v, e] of sortedRgba.slice(0, 12)) {
  console.log(`  ${String(e.n).padStart(4)}×  ${v}`);
}
console.log(`\n  说明：rgba 多用于遮罩/hover/阴影/状态底色的半透明叠加，`);
console.log(`  属于"同一色板不同透明度"，硬编码是常见且合理做法；`);
console.log(`  真正值得收敛的只有"重复 ≥10 次且语义固定"的那几个。\n`);
