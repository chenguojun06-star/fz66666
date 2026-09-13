#!/usr/bin/env node
/**
 * 内联样式基线锁：允许减少，不允许增加
 *
 * 用法：
 *   node frontend/scripts/check-inline-style.mjs               # 检查（CI 用，超基线 exit 1）
 *   node frontend/scripts/check-inline-style.mjs --update      # 重设基线（清理完一批后执行）
 *   node frontend/scripts/check-inline-style.mjs --top=20      # 看分布最重的文件
 *
 * 背景：全站 7946 处 style={{}}，其中 4435 处是硬编码的布局/尺寸（padding/margin/fontSize/
 * width/height/gap/color…）。这些本该写在 CSS 里 —— 内联样式既不能被主题覆盖，
 * 也无法批量收敛（改 CSS 完全无效），是 UI 一致性的最大破坏源。
 *
 * 策略：存量渐进清理，但**绝不能继续变多**。本脚本锁住基线，CI 里只降不升。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CWD = process.cwd();
const BASELINE = join(CWD, 'frontend/scripts/inline-style-baseline.json');
const UPDATE = process.argv.includes('--update');
const topArg = (process.argv.find((a) => a.startsWith('--top=')) || '').split('=')[1];
const TOP = Number(topArg || 0);

const files = execSync('find frontend/src -name "*.tsx" -type f', { encoding: 'utf8', cwd: CWD })
  .trim().split('\n').filter(Boolean);

// 硬编码布局/尺寸属性：这些出现在内联样式里 = 本该写进 CSS
const LAYOUT_RE = /\b(padding|paddingTop|paddingRight|paddingBottom|paddingLeft|margin|marginTop|marginRight|marginBottom|marginLeft|fontSize|fontWeight|width|height|minWidth|maxWidth|minHeight|maxHeight|gap|rowGap|columnGap|color|background|borderRadius|lineHeight)\s*:/;

let total = 0, layout = 0;
const byFile = [];
const byModule = {};

for (const rel of files) {
  const t = readFileSync(join(CWD, rel), 'utf8');
  let n = 0, l = 0;
  for (const m of t.matchAll(/style=\{\{([^}]*)\}\}/g)) {
    n++;
    if (LAYOUT_RE.test(m[1])) l++;
  }
  if (!n) continue;
  total += n;
  layout += l;
  byFile.push({ rel, n, l });
  const key = rel.replace('frontend/src/', '').split('/').slice(0, 2).join('/');
  byModule[key] = (byModule[key] || 0) + n;
}

const now = { total, layout, capturedAt: new Date().toISOString().slice(0, 10) };

console.log(`\n内联样式统计（${now.capturedAt}）`);
console.log(`  总计        ${total} 处`);
console.log(`  硬编码布局  ${layout} 处（${(layout / total * 100).toFixed(0)}%）\n`);

if (TOP) {
  console.log(`── 重灾区 TOP ${TOP} ──`);
  for (const f of byFile.sort((a, b) => b.n - a.n).slice(0, TOP)) {
    console.log(`  ${String(f.n).padStart(4)}  ${f.rel.replace('frontend/src/', '')}`);
  }
  console.log('');
}

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify({ ...now, byModule }, null, 2));
  console.log(`✅ 基线已写入 ${BASELINE.replace(CWD + '/', '')}`);
  console.log('   把它提交进仓库，CI 之后就只允许比这个数字更小。\n');
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
console.log(`── 与基线对比（基线 ${base.capturedAt}）──`);
console.log(`  总计        ${String(base.total).padStart(5)} → ${String(total).padStart(5)}  ${fmt(total - base.total)}`);
console.log(`  硬编码布局  ${String(base.layout).padStart(5)} → ${String(layout).padStart(5)}  ${fmt(layout - base.layout)}\n`);

function fmt(d) {
  if (d === 0) return '（持平）';
  return d < 0 ? `↓ ${-d}  ✅` : `↑ ${d}  ❌ 超基线`;
}

if (total > base.total || layout > base.layout) {
  console.log('❌ 内联样式超过基线。请把新增的样式写进 CSS（或 CSS Module），不要再加 style={{}}。');
  console.log('   如果这批确实是清理后的合理结果，执行 --update 重设基线。\n');
  process.exit(1);
}
console.log('✅ 未超基线\n');
