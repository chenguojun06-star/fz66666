#!/usr/bin/env node
/**
 * 智能颜色检测脚本 — 识别前端项目中可安全替换的中性色 vs 必须保留的业务风险色。
 * 用法: node scripts/detect-neutrals.mjs
 * 输出: 中性色按频次排序 → 建议自动替换 → 业务色列表 → 确认不变。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = join(import.meta.dirname, '..', 'frontend', 'src');
const EXTENSIONS = new Set(['.tsx', '.ts', '.css', '.jsx', '.js']);

const BUSINESS_COLORS = new Set([
  '#cf1322', '#a8071a', '#820014',  // 逾期红
  '#389e0d', '#237804', '#135200',  // 已付绿
  '#ff4d4f', '#f5222d', '#e84749',  // 危险红
  '#faad14', '#d48806',             // 警告橙
  '#07c160', '#1aad19',             // 微信绿
  '#1677ff', '#1677FF', '#0958d9',  // 支付宝蓝/antd蓝
  '#52c41a', '#73d13d',             // 成功绿
  '#ffec3d', '#fffb8f',             // 警示黄
  '#f59a23', '#e87040',             // 延迟橙
  '#000000d9', '#000000e0',         // antd颜色（含透明度）
  'rgba(0,0,0,0.85', 'rgba(0,0,0,0.65', 'rgba(0,0,0,0.45',
  'rgba(0,0,0,0.25', 'rgba(0,0,0,0.06',
]);

const CSS_VAR_MAP = {
  '#ffffff':   'var(--color-bg-base)',
  '#fff':      'var(--color-bg-base)',
  '#FFF':      'var(--color-bg-base)',
  'white':     'var(--color-bg-base)',
  '#fafafa':   'var(--color-bg-container)',
  '#f9f9f9':   'var(--color-bg-container)',
  '#f5f5f5':   'var(--color-bg-light)',
  '#f0f0f0':   'var(--color-border-light)',
  '#e8e8e8':   'var(--color-border)',
  '#d9d9d9':   'var(--color-border-antd)',
  '#bfbfbf':   'var(--color-text-quaternary)',
  '#8c8c8c':   'var(--color-text-quaternary)',
  '#999':      'var(--color-text-tertiary)',
  '#999999':   'var(--color-text-tertiary)',
  '#666':      'var(--color-text-secondary)',
  '#666666':   'var(--color-text-secondary)',
  '#333':      'var(--color-text-primary)',
  '#333333':   'var(--color-text-primary)',
  '#262626':   'var(--color-text-primary)',
  '#000':      'var(--color-text-primary)',
  'black':     'var(--color-text-primary)',
  '#000000':   'var(--color-text-primary)',
  '#222':      'var(--color-text-primary)',
};

const NEUTRAL_PATTERNS = new Set(Object.keys(CSS_VAR_MAP));

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    try {
      const st = statSync(full);
      if (st.isDirectory()) { results.push(...walk(full)); }
      else if (EXTENSIONS.has(extname(entry))) { results.push(full); }
    } catch (_) {}
  }
  return results;
}

const hex = /#[0-9a-fA-F]{3,8}\b/g;
const rgba = /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;

function findColors(content) {
  const matches = [];
  for (const m of content.matchAll(hex)) {
    const c = m[0].toLowerCase();
    if (c === '#fff' || c.length === 4 || c.length === 7 || c.length === 9) {
      matches.push({ val: c, idx: m.index });
    }
  }
  for (const m of content.matchAll(rgba)) {
    matches.push({ val: m[0].replace(/\s/g, ''), idx: m.index });
  }
  return matches;
}

const files = walk(ROOT);
const neutralCount = new Map();
const businessCount = new Map();
let totalNeutral = 0;
let totalBusiness = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8');
    for (const { val } of findColors(content)) {
      const key = val;
      if (BUSINESS_COLORS.has(key)) {
        businessCount.set(key, (businessCount.get(key) || 0) + 1);
        totalBusiness++;
      } else if (NEUTRAL_PATTERNS.has(key)) {
        neutralCount.set(key, (neutralCount.get(key) || 0) + 1);
        totalNeutral++;
      }
    }
  } catch (_) {}
}

console.log('=== 中性色 (可安全替换为 CSS 变量) ===');
console.log(`总计: ${totalNeutral} 处\n`);
[...neutralCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([color, count]) => {
    const varName = CSS_VAR_MAP[color];
    console.log(`  ${color.padEnd(16)} → ${varName.padEnd(35)} ${count} 处`);
  });

console.log(`\n=== 业务风险色 (必须保留) ===`);
console.log(`总计: ${totalBusiness} 处\n`);
[...businessCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([color, count]) => {
    console.log(`  ${color.padEnd(20)} ${count} 处`);
  });

console.log(`\n=== 建议 ===`);
const top5Neutrals = [...neutralCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

if (top5Neutrals.length > 0) {
  console.log('下一批优先替换 Top 5 中性色:');
  for (const [color, count] of top5Neutrals) {
    const varName = CSS_VAR_MAP[color];
    console.log(`  sed -i '' 's/${color}/${varName}/g' ...`);
    console.log(`  (${count} 处 → 批量替换 0 风险)`);
  }
}

console.log(`\n中性色可替换: ${totalNeutral}  业务色保留: ${totalBusiness}  剩余进度: ${totalNeutral}/~555`);