#!/usr/bin/env node
/**
 * 小程序 WXML「循环变量遮蔽 data 键」静态扫描（D-729）
 *
 * 背景：2026-10-03 用户实测报「小云待办卡片按钮文字全空、款式小图消失」。
 *   根因之一是 i18n 批次（D-623）把按钮写成了 <button>{{t.btnView}}</button>，
 *   而该卡片的循环变量恰好也叫 t（wx:for-item="t"）——
 *   WXML 里循环变量会**遮蔽**组件 data 里的同名键，{{t.btnView}} 取到的是
 *   待办对象上的 btnView（不存在）→ 渲染成空字符串。
 *   全程不报错：开发者工具编译通过、真机不报错、现有 8 道门禁（引用完整性 /
 *   三副本一致 / no-undef / invalid-this / 页面逻辑测试 / i18n 键 / 循环依赖）全部放行。
 *
 * 规则：wxml 里出现 wx:for-item="NAME"，且同目录同名 .js 的 data / setData 里
 *   定义了同名键 NAME → 报告为遮蔽风险（循环体内 {{NAME.xxx}} 会取到循环项而非 data）。
 *
 * 用法：node scripts/check-mp-wxml-shadow.js [miniprogram目录，默认 ./miniprogram]
 * 退出码：0 = 无问题；1 = 命中
 */
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.join(__dirname, '..', 'miniprogram');

/** 递归收集 .wxml */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.wxml')) out.push(full);
  }
  return out;
}

/**
 * 提取一段对象字面量的顶层键名（大括号配平，忽略字符串里的括号）
 * @param {string} src 源码
 * @param {number} braceIdx 左大括号下标
 * @returns {string[]} 键名列表
 */
function topLevelKeys(src, braceIdx) {
  const keys = [];
  let depth = 0;
  let quote = null;
  let token = '';
  for (let i = braceIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') { depth += 1; continue; }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1 && ch === ':') {
      const m = token.trim().match(/([A-Za-z_$][\w$]*)\s*$/);
      if (m) keys.push(m[1]);
      token = '';
      continue;
    }
    token += ch;
  }
  return keys;
}

/**
 * 收集 js 源码里所有 data 键：`data: {` 与 `setData({`
 * @param {string} src js 源码
 * @returns {Set<string>} 键名集合
 */
function collectDataKeys(src) {
  const keys = new Set();
  const patterns = [/\bdata\s*:\s*\{/g, /\bsetData\s*\(\s*\{/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const braceIdx = src.indexOf('{', m.index);
      if (braceIdx < 0) continue;
      for (const k of topLevelKeys(src, braceIdx)) keys.add(k);
    }
  }
  return keys;
}

const problems = [];
const files = walk(root);

for (const wxml of files) {
  const jsPath = wxml.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) continue;
  const wxmlSrc = fs.readFileSync(wxml, 'utf8');
  const names = new Set();
  const re = /wx:for-item\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(wxmlSrc)) !== null) names.add(m[1]);
  if (names.size === 0) continue;

  const dataKeys = collectDataKeys(fs.readFileSync(jsPath, 'utf8'));
  if (dataKeys.size === 0) continue;

  for (const name of names) {
    if (!dataKeys.has(name)) continue;
    // 循环体内是否真的引用了 {{name.xxx}} —— 只用作 wx:key 之类不算遮蔽风险
    const used = new RegExp('\\{\\{[^}]*\\b' + name + '\\s*\\.').test(wxmlSrc);
    if (!used) continue;
    const rel = path.relative(path.join(__dirname, '..'), wxml);
    problems.push(`${rel}: wx:for-item="${name}" 与 js 的 data 键 "${name}" 同名 → 循环内 {{${name}.*}} 会取到循环项而非 data`);
  }
}

if (problems.length > 0) {
  console.log('[mp-wxml-shadow] 🔍 wxml 循环变量遮蔽 data 键扫描');
  for (const p of problems) console.log('   ❌ ' + p);
  console.log(`❌ 共 ${problems.length} 处遮蔽风险 —— 把 wx:for-item 改成不与 data 键同名的名字（如 t → task）`);
  process.exit(1);
}
console.log(`[mp-wxml-shadow] ✅ 扫描 ${files.length} 个 wxml，无循环变量遮蔽 data 键`);
process.exit(0);
