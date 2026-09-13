#!/usr/bin/env node
/**
 * UI 规范检查：CSS 里是否又冒出规范外的野值
 *
 * 用法：node frontend/scripts/check-ui-tokens.mjs
 *
 * 规范档位（2026-09-13 确立，见 docs/前端UI工整度审查-2026-09-13.md）：
 *   字号  12 / 13 / 14 / 16 / 20        （18 及以上允许，多为图标与大标题）
 *   圆角  4 / 6 / 8                      （50% 头像、999px 状态标签允许）
 *   间距  4 / 8 / 12 / 16 / 20 / 24 / 32 / 40   （1、2 允许，多为边框补偿）
 *
 * 设计原则：**只报告，不阻断**（exit 0）。
 * 原因：老代码里仍存在历史遗留的合理例外（图表配色尺寸、第三方组件覆盖等），
 * 一刀切阻断会逼着人写 !important 绕过，反而更糟。
 * 这里的价值是让"新增的野值"在 CI 日志里看得见。
 *
 * 安全：打印/标签相关文件整文件跳过（打印样式改动会导致打印排版错乱）。
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CWD = process.cwd();
const PRINT_PATTERN = /print|label|wash|barcode|sticker|quotation|certificate/i;

const RULES = [
  {
    name: '字号',
    decl: /font-size:(\s*)([^;]+);/g,
    ok: (v) => {
      const n = parseInt(v, 10);
      return [12, 13, 14, 16, 20].includes(n) || n >= 18;
    },
    hint: '规范档位 12/13/14/16/20（18+ 多为图标，允许）',
  },
  {
    name: '圆角',
    decl: /border-radius:(\s*)([^;]+);/g,
    ok: (v) => {
      if (/50%|999px|var\(/.test(v)) return true;
      const nums = [...v.matchAll(/(\d+)px/g)].map((m) => parseInt(m[1], 10));
      return nums.every((n) => [4, 6, 8].includes(n));
    },
    hint: '规范档位 4/6/8（50% 头像、999px 状态标签允许）',
  },
  {
    name: '间距',
    decl: /\b(padding|margin|gap|row-gap|column-gap)(-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?(\s*):(\s*)([^;]+);/g,
    ok: (v) => {
      const nums = [...v.matchAll(/(\d+)px/g)].map((m) => parseInt(m[1], 10));
      return nums.every((n) => [1, 2, 4, 8, 12, 16, 20, 24, 32, 40].includes(n));
    },
    hint: '8pt 网格 4/8/12/16/20/24/32/40（1、2 多为边框补偿，允许）',
  },
];

const files = execSync('find frontend/src -name "*.css" -type f', { encoding: 'utf8', cwd: CWD })
  .trim().split('\n').filter(Boolean);

const violations = { 字号: [], 圆角: [], 间距: [] };

for (const rel of files) {
  if (PRINT_PATTERN.test(rel)) continue;
  const text = readFileSync(join(CWD, rel), 'utf8');
  for (const rule of RULES) {
    rule.decl.lastIndex = 0;
    let m;
    while ((m = rule.decl.exec(text)) !== null) {
      const val = m[m.length - 1];
      if (/var\(/.test(val)) continue;      // 已用 token 的一律放过
      if (!rule.ok(val)) {
        const line = text.slice(0, m.index).split('\n').length;
        violations[rule.name].push(`${rel}:${line}  ${m[0].trim()}`);
      }
    }
  }
}

console.log('\n═══ UI 规范检查 ═══\n');
let total = 0;
for (const rule of RULES) {
  const list = violations[rule.name];
  total += list.length;
  console.log(`${rule.name}：${list.length} 处超出规范`);
  if (list.length) {
    console.log(`   ${rule.hint}`);
    for (const v of list.slice(0, 8)) console.log(`   · ${v}`);
    if (list.length > 8) console.log(`   … 还有 ${list.length - 8} 处`);
  }
  console.log('');
}
console.log(`合计 ${total} 处。这些是历史遗留或有意例外，不阻断 CI，`);
console.log(`但**新增代码请按规范档位来**，别让这个数字变大。\n`);
process.exit(0);
