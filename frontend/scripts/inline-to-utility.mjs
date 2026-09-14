#!/usr/bin/env node
/**
 * 内联静态样式 → 全局原子工具类（utilities.css）
 *
 * 背景：全站 7946 处 style={{}}，其中 7520 处（94.6%）是纯静态字面量。
 *       内联样式优先级最高、无法被主题覆盖、无法批量收敛，是 UI 一致性的最大破坏源。
 *       本脚本把静态内联样式迁到 utilities.css 的原子类；动态样式一律保留内联。
 *
 * 用法（在项目根目录执行）：
 *   node frontend/scripts/inline-to-utility.mjs              # 空跑报告
 *   node frontend/scripts/inline-to-utility.mjs --gen        # 生成 utilities.css
 *   node frontend/scripts/inline-to-utility.mjs --apply      # 实际改写 tsx（先空跑！）
 *   node frontend/scripts/inline-to-utility.mjs --min=15     # 只生成频次≥15 的类（默认 15）
 *   node frontend/scripts/inline-to-utility.mjs --only=AppStore  # 只处理路径含此片段的文件（试点用）
 *
 * 安全策略：
 *   1. 两遍扫描：先统计频次定出「允许的类」，再替换。低频类**不进 CSS 也不替换**，
 *      继续留在 style 里 —— 避免「类名写进 tsx 但 CSS 里没定义」导致样式凭空丢失
 *   2. 部分迁移：能映射的抽成类，不能映射的（如 color）保留在 style
 *   3. 动态样式（模板字符串/三元/||/&&）跳过
 *   4. className 为表达式（className={...}）时跳过，只处理字符串字面量
 *   5. 危险属性（color/background/boxShadow，主题敏感）不迁移
 *   6. width/height 只接受百分比或关键字，数值型（如 width:120）跳过——布局敏感易回归
 *   7. className 查找用逐字符扫描（遇 < 或 > 即停），不能用 indexOf('>') 定位标签边界，
 *      否则会命中嵌套标签的 /> 导致范围错位（曾生成 style={{ marginBassName=... 的坏码）
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CWD = process.cwd();
const APPLY = process.argv.includes('--apply');
const GEN = process.argv.includes('--gen');
const minArg = (process.argv.find((a) => a.startsWith('--min=')) || '').split('=')[1];
const MIN_FREQ = Number(minArg || 15);
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

// ── 属性 → 类名前缀 ──
const PROP_PREFIX = {
  fontSize: 'fs', fontWeight: 'fw', lineHeight: 'lh', textAlign: 'ta',
  margin: 'm', marginTop: 'mt', marginRight: 'mr', marginBottom: 'mb', marginLeft: 'ml',
  padding: 'p', paddingTop: 'pt', paddingRight: 'pr', paddingBottom: 'pb', paddingLeft: 'pl',
  gap: 'gap', rowGap: 'rgap', columnGap: 'cgap',
  display: 'd', flexDirection: 'fd', alignItems: 'ai', justifyContent: 'jc',
  flexWrap: 'fwrap', flex: 'flex', flexShrink: 'fshrink', flexGrow: 'fgrow',
  borderRadius: 'br', overflow: 'ov', cursor: 'cur', whiteSpace: 'ws',
  position: 'pos', width: 'w', height: 'h', minWidth: 'minw', maxWidth: 'maxw',
  minHeight: 'minh', maxHeight: 'maxh', objectFit: 'objf', zIndex: 'z',
};

// 数值需要补 px 的属性
const NEEDS_PX = new Set([
  'fontSize', 'lineHeight', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'rowGap', 'columnGap', 'borderRadius',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
]);

// 主题敏感 / 视觉回归风险高 —— 不迁移
const BLOCKED_PROPS = new Set(['color', 'background', 'backgroundColor', 'backgroundImage', 'boxShadow', 'border', 'borderColor', 'transform', 'transition', 'animation']);

// 值 → 类名片段（处理不能进类名的字符）
const VAL_ALIAS = {
  'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly',
  'flex-start': 'start', 'flex-end': 'end',
  '100%': 'full', '50%': 'half', '100vh': 'fullvh', '100vw': 'fullvw',
  'nowrap': 'nowrap', 'pointer': 'pointer', 'not-allowed': 'notallowed',
};

function valToken(v) {
  const s = String(v).trim();
  if (VAL_ALIAS[s]) return VAL_ALIAS[s];
  return s.replace(/[^\w-]/g, '');
}

function cssValue(prop, v) {
  const raw = String(v).trim();
  if (/^-?[\d.]+$/.test(raw) && NEEDS_PX.has(prop)) return raw + 'px';
  return raw;
}

function kebab(prop) {
  return prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/** (prop,value) → 原子类名；不可迁移返回 null */
function propToClass(prop, v) {
  if (BLOCKED_PROPS.has(prop)) return null;
  const prefix = PROP_PREFIX[prop];
  if (!prefix) return null;
  const raw = String(v).trim();
  // width/height 只接受百分比或关键字，数值型跳过（布局敏感）
  if (/^(width|height|minWidth|maxWidth|minHeight|maxHeight)$/.test(prop)) {
    if (/^-?[\d.]+$/.test(raw)) return null;
    if (!/^(\d+(\.\d+)?(vh|vw|%|em|rem)|auto|fit-content|max-content|min-content)$/.test(raw)) return null;
  }
  const token = valToken(raw);
  if (!token) return null;
  return `u-${prefix}-${token}`;
}

/** 提取 style={{ ... }}，括号计数支持嵌套 */
function extractStyles(text) {
  const out = [];
  const re = /style=\{\{/g;
  let m;
  while ((m = re.exec(text))) {
    const openEnd = m.index + m[0].length;
    let i = openEnd, depth = 1, buf = '';
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
      buf += c;
      i++;
    }
    if (depth !== 0) continue;
    out.push({ startIdx: m.index, endIdx: i + 2, content: buf });
  }
  return out;
}

const isDynamic = (s) => /\$\{/.test(s) || /\?[^.]*:/.test(s) || /\|\|/.test(s) || /&&/.test(s);

/** 解析样式内容；遇到无法处理的结构返回 null */
function parseProps(content) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of content) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  parts.push(cur);
  const props = [];
  for (const p of parts) {
    const mm = /^\s*([A-Za-z][\w]*)\s*:\s*(.+?)\s*$/s.exec(p);
    if (!mm) return null;
    const [, prop, val] = mm;
    const vm = /^(?:'([^']*)'|"([^"]*)"|(-?[\d.]+))$/.exec(val.trim());
    if (!vm) return null;
    const v = vm[1] !== undefined ? vm[1] : (vm[2] !== undefined ? vm[2] : vm[3]);
    props.push({ prop, value: v, raw: `${prop}: ${val.trim()}` });
  }
  return props.length ? props : null;
}

// ── 文件列表 ──
let files = execSync('find frontend/src -name "*.tsx" -type f', { encoding: 'utf8', cwd: CWD })
  .trim().split('\n').filter(Boolean);
if (onlyArg) {
  files = files.filter((f) => f.includes(onlyArg));
  console.log(`（--only="${onlyArg}" 命中 ${files.length} 个文件，仅处理这些）`);
}

// 打印相关文件整文件跳过 —— 硬红线（见 MEMORY.md「打印样式：改不得」）
// 改动打印样式会导致打印排版错乱 / 字体丢失：打印模板大量是 tsx 里的内联 HTML 字符串，
// 里面写死 font-size，改了直接导致打印看不到字。
const PRINT_PATH_RE = /print|label|wash|barcode|sticker|quotation|certificate/i;
const printSkipped = files.filter((f) => PRINT_PATH_RE.test(f));
files = files.filter((f) => !PRINT_PATH_RE.test(f));
if (printSkipped.length) {
  console.log(`（打印红线：跳过 ${printSkipped.length} 个 print/label/wash/barcode/sticker/quotation/certificate 文件）`);
}

// ── 第一遍：统计频次 ──
const freq = {};
let totalInline = 0, dynamic = 0;
for (const rel of files) {
  const text = readFileSync(join(CWD, rel), 'utf8');
  if (/@media\s+print/i.test(text)) continue; // 打印红线（块级）
  for (const st of extractStyles(text)) {
    totalInline++;
    if (isDynamic(st.content)) { dynamic++; continue; }
    const props = parseProps(st.content);
    if (!props) continue;
    for (const { prop, value } of props) {
      const k = `${prop}|${value}`;
      freq[k] = (freq[k] || 0) + 1;
    }
  }
}

// 允许进入 CSS 的类（频次达标）
const allowed = new Set();
const classDefs = {};
for (const [k, v] of Object.entries(freq)) {
  const [prop, value] = k.split('|');
  const cls = propToClass(prop, value);
  if (!cls) continue;
  if (!classDefs[cls]) classDefs[cls] = `${kebab(prop)}: ${cssValue(prop, value)};`;
  if (v >= MIN_FREQ) allowed.add(cls);
}

// ── 第二遍：替换（只用 allowed 内的类，其余保留在 style） ──
let converted = 0, skipped = 0;
const edits = [];

for (const rel of files) {
  const text = readFileSync(join(CWD, rel), 'utf8');
  if (/@media\s+print/i.test(text)) continue; // 打印红线（块级）
  const styles = extractStyles(text);
  if (!styles.length) continue;

  const localEdits = [];
  for (const st of styles) {
    if (isDynamic(st.content)) continue;
    const props = parseProps(st.content);
    if (!props) continue;

    const classes = [];
    const keep = [];
    for (const p of props) {
      const cls = propToClass(p.prop, p.value);
      // 关键：只有「已确定会写进 CSS」的类才替换，否则留在 style 里，避免样式丢失
      if (cls && allowed.has(cls)) classes.push(cls);
      else keep.push(p.raw);
    }
    if (!classes.length) { skipped++; continue; }
    localEdits.push({ st, classes, keep });
  }
  if (!localEdits.length) continue;

  let out = text;
  for (const { st, classes, keep } of localEdits.reverse()) {
    const clsStr = classes.join(' ');
    const stylePart = keep.length ? `style={{ ${keep.join(', ')} }}` : '';

    // ① 反向找标签开始 '<'。
    //    必须「深度感知」：onClick={() => ...} 里的 => 含 '>'，直接按字符判断会误当作标签结束，
    //    导致扫描提前中断、找不到已有 className，于是又新建一个 → 重复属性 TS17001。
    let depth = 0, tagStart = -1;
    const backLim = Math.max(0, st.startIdx - 2000);
    for (let i = st.startIdx - 1; i >= backLim; i--) {
      const c = out[i];
      if (c === '}' || c === ')') depth++;
      else if (c === '{' || c === '(') depth--;
      else if (depth === 0 && c === '<' && /[A-Za-z/]/.test(out[i + 1] || '')) { tagStart = i; break; }
      else if (depth === 0 && c === '>') break;
    }
    if (tagStart < 0 || out[tagStart + 1] === '/') { skipped++; continue; }

    // ② 只处理原生 DOM 元素（标签名小写开头）。
    //    自定义组件的 Props 未必声明 className，强行加会报 TS2322
    //    （实测 SideCardPanel / SupplierNameTooltip / StyleDevelopmentProgressBanner 等均不支持）。
    //    宁可少迁移，也不要制造类型错误。
    const tagNameM = /^<([A-Za-z][\w.-]*)/.exec(out.slice(tagStart, tagStart + 40));
    if (!tagNameM || !/^[a-z]/.test(tagNameM[1])) { skipped++; continue; }

    // ③ 正向找标签结束 '>'（同样深度感知，避免把 => 当成标签结束）
    let d2 = 0, tagEnd = -1;
    for (let i = tagStart + 1; i < out.length; i++) {
      const c = out[i];
      if (c === '{' || c === '(') d2++;
      else if (c === '}' || c === ')') d2--;
      else if (d2 === 0 && c === '>') { tagEnd = i; break; }
    }
    if (tagEnd < 0) { skipped++; continue; }

    // ④ 在标签范围内找 className（取第一个）
    const cmRel = out.slice(tagStart, tagEnd).indexOf('className=');
    if (cmRel >= 0) {
      const valStart = tagStart + cmRel + 'className='.length;
      if (out[valStart] === '"') {
        const close = out.indexOf('"', valStart + 1);
        const existing = out.slice(valStart + 1, close);
        const existSet = new Set(existing.split(/\s+/).filter(Boolean));
        if (classes.every((c) => existSet.has(c))) { skipped++; continue; } // 幂等
        // 必须 close + 1：跳过原结束引号，否则残留一个多余的 "
        out = out.slice(0, valStart) + `"${existing} ${clsStr}"` + out.slice(close + 1);
        // className 在 style 之前时 style 位置后移 delta；在之后则不受影响
        const delta = valStart < st.startIdx ? clsStr.length + 1 : 0;
        const sStart = st.startIdx + delta;
        const sEnd = st.endIdx + delta;
        out = out.slice(0, sStart) + stylePart + out.slice(sEnd);
        converted++;
        continue;
      }
      skipped++; // className={...} 表达式，保守跳过
      continue;
    }

    // ⑤ 标签内无 className：把 style 段替换为 className（+ 保留的 style）
    const parts = [`className="${clsStr}"`, stylePart].filter(Boolean);
    out = out.slice(0, st.startIdx) + parts.join(' ') + out.slice(st.endIdx);
    converted++;
  }
  edits.push({ rel, text: out });
}

// ── 报告 ──
console.log(`\n内联样式 → 原子类${APPLY ? '（已应用）' : '（空跑）'}  频次阈值 ≥${MIN_FREQ}`);
console.log('─'.repeat(60));
console.log(`  内联样式总数      ${totalInline}`);
console.log(`  动态（保留内联）  ${dynamic}`);
console.log(`  已迁移            ${converted}`);
console.log(`  跳过（不可映射）  ${skipped}`);
console.log(`  涉及文件          ${edits.length}`);
console.log(`  允许的类（进 CSS） ${allowed.size}`);

const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
console.log(`\n  TOP 10 高频组合：`);
for (const [k, v] of sorted.slice(0, 10)) console.log(`    ${String(v).padStart(5)}  ${k.replace('|', ': ')}`);

if (GEN) {
  const out = [];
  out.push('/* 全局原子工具类 —— 由 scripts/inline-to-utility.mjs 自动生成，请勿手改 */');
  out.push('/* 用途：替代静态内联样式 style={{}}，使样式可被主题覆盖、可响应式、可批量收敛 */');
  out.push('/* 注意：本文件在 main.tsx 中最后引入，以保证优先级等价于原内联样式 */');
  out.push('');
  const names = Object.keys(classDefs).filter((c) => allowed.has(c)).sort();
  // 双写类名（.u-fs-14.u-fs-14）把特异性从 (0,1,0) 提到 (0,2,0)。
  // 原因：这些类是用来替代**内联样式**的，而内联样式不会被普通 CSS 覆盖。
  // 单类会被 .parent .child 这类后代选择器（0,2,0）压过 → 视觉回归。
  // 双写后与后代选择器同特异性，靠"utilities.css 最后加载"取胜 ≈ 还原内联行为。
  // 实测项目里有 642 个（21.7%）设置迁移属性的选择器特异性高于单类，确有此风险。
  for (const cls of names) out.push(`.${cls}.${cls} { ${classDefs[cls]} }`);
  const dest = join(CWD, 'frontend/src/styles/utilities.css');
  writeFileSync(dest, out.join('\n') + '\n');
  console.log(`\n✅ 已生成 ${dest.replace(CWD + '/', '')}（${names.length} 个类）`);
}

if (APPLY) {
  for (const e of edits) writeFileSync(join(CWD, e.rel), e.text);
  console.log(`\n✅ 已改写 ${edits.length} 个文件`);
} else if (!GEN) {
  console.log('\n（空跑模式，未写入。加 --gen 生成 CSS，加 --apply 改写文件）');
}
console.log('');
