#!/usr/bin/env node
/**
 * 小云 AI 评测集自动跑分脚本（零依赖，Node 18+）
 *
 * 用法：
 *   export EVAL_BASE_URL="https://你的域名"
 *   export EVAL_TOKEN="Bearer eyJhbGciOi..."      # 从浏览器 F12 复制 Authorization 头，必须带 Bearer
 *   node eval/run-eval.mjs                        # 跑全部
 *   node eval/run-eval.mjs --only=A,D             # 只跑 A 组和 D 组
 *   node eval/run-eval.mjs --allow-dangerous      # 连 E4（删订单）一起跑，默认跳过
 *
 * 产出：eval/results/<时间戳>.json（原始数据）+ .md（待评分报告）
 *
 * 设计原则：
 *   1. 只读为主 —— 唯一有写风险的是 E4，默认跳过
 *   2. 可重复 —— 同一份用例随时重跑，结果自动落盘，供改动前后对比
 *   3. 延迟以"用户看到答案的时间"为准（收到 answer 事件即停表）
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ────────────────────────── 参数 ──────────────────────────
const argv = process.argv.slice(2);
const getArg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const hasFlag = (k) => argv.includes(`--${k}`);

const ONLY = (getArg('only') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const ALLOW_DANGEROUS = hasFlag('allow-dangerous');

const BASE_URL = (process.env.EVAL_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.EVAL_TOKEN || '';
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT || 120000);
const GAP_MS = Number(process.env.EVAL_GAP || 1500);

if (!BASE_URL || !TOKEN) {
  console.error('缺少环境变量。请先设置：\n  export EVAL_BASE_URL="https://你的域名"\n  export EVAL_TOKEN="Bearer xxx"\n');
  process.exit(1);
}

const CHAT_PATH = '/api/intelligence/ai-advisor/chat/stream';
const REFUSE_HINTS = ['没有找到', '未找到', '查不到', '无此', '不存在', '无法提供', '无法回答', '没有相关', '未查询到', '超出', '拒绝', '没有数据'];

// ────────────────────────── 用例 ──────────────────────────
const cfg = JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf8'));
const ph = { ...cfg.placeholders };
// 允许用环境变量覆盖占位符：EVAL_PH_STYLE_NO=xxx
for (const k of Object.keys(ph)) {
  const envV = process.env[`EVAL_PH_${k}`];
  if (envV) ph[k] = envV;
}
const fill = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => ph[k] ?? `{{${k}}}`);

// ────────────────────────── SSE ──────────────────────────
async function ask(question, conversationId) {
  const url = new URL(BASE_URL + CHAT_PATH);
  url.searchParams.set('question', question);
  if (conversationId) url.searchParams.set('conversationId', conversationId);

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  const state = { text: '', answer: '', tools: [], error: null, finished: false };

  try {
    const res = await fetch(url, {
      headers: { Authorization: TOKEN, Accept: 'text/event-stream' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ...state, ms: Date.now() - started, httpStatus: res.status, error: `HTTP ${res.status}` };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (!state.finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleEvent(raw, state);
        if (state.finished) break;
      }
    }
    try { await reader.cancel(); } catch { /* noop */ }
  } catch (e) {
    state.error = e.name === 'AbortError' ? `超时 ${TIMEOUT_MS}ms` : String(e.message || e);
  } finally {
    clearTimeout(timer);
  }
  return { ...state, ms: Date.now() - started };
}

function handleEvent(raw, state) {
  let type = '';
  let dataStr = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return;

  let payload;
  try { payload = JSON.parse(dataStr); } catch { return; }

  // 兼容两种形态：{type,data} 与 裸 {chunk/content}
  const t = type || payload.type || '';
  const d = payload.data ?? payload;

  switch (t) {
    case 'answer_chunk':
      state.text += String(d.chunk ?? '');
      break;
    case 'answer':
      state.answer = String(d.content ?? '');
      state.finished = true; // 用户看到答案即停表
      break;
    case 'tool_call':
      state.tools.push(String(d.tool ?? ''));
      break;
    case 'error':
      state.error = String(d.message ?? '未知错误');
      state.finished = true;
      break;
    default:
      break;
  }
}

// ────────────────────────── 主流程 ──────────────────────────
const results = [];
const conversations = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function autoJudge(c, finalText) {
  const out = {};
  if (c.detect?.length) {
    const hits = c.detect.filter((k) => ph[k] && finalText.includes(ph[k]));
    out.detectHit = hits.length > 0;
    out.detectMatched = hits;
  }
  if (c.mode === 'refuse') {
    out.refuseSignal = REFUSE_HINTS.some((h) => finalText.includes(h));
  }
  return out;
}

console.log(`\n开始跑评测 · ${BASE_URL}\n`);

for (const g of cfg.groups) {
  if (ONLY.length && !ONLY.includes(g.id)) continue;
  console.log(`── ${g.id} 组 ${g.name}`);

  for (const c of g.cases) {
    if (c.dangerous && !ALLOW_DANGEROUS) {
      console.log(`   ${c.id} 跳过（有写风险，需 --allow-dangerous）`);
      results.push({ id: c.id, group: g.id, q: fill(c.q), skipped: true, reason: 'dangerous' });
      continue;
    }

    const convKey = c.conversation || `${g.id}_${c.id}`;
    if (!conversations.has(convKey)) conversations.set(convKey, randomUUID());
    const convId = conversations.get(convKey);

    const repeat = c.repeat || 1;
    const runs = [];
    for (let i = 0; i < repeat; i++) {
      const r = await ask(fill(c.q), convId);
      const finalText = r.answer || r.text || '';
      runs.push({
        round: i + 1,
        ms: r.ms,
        httpStatus: r.httpStatus ?? 200,
        error: r.error,
        tools: r.tools,
        length: finalText.length,
        text: finalText,
      });
      const tag = repeat > 1 ? ` ${i + 1}/${repeat}` : '';
      console.log(`   ${c.id}${tag} ${r.ms}ms${r.error ? ' ✗ ' + r.error : ''}${finalText ? '' : ' (空回答)'}`);
      if (i < repeat - 1) await sleep(GAP_MS);
    }

    const last = runs[runs.length - 1];
    results.push({
      id: c.id, group: g.id, q: fill(c.q), expect: c.expect, mode: c.mode || null,
      conversation: c.conversation || null, runs,
      auto: autoJudge(c, last.text),
      correct: null, // 人工填：0=答错/编造 1=部分正确 2=正确且完整
    });
    await sleep(GAP_MS);
  }
}

// ────────────────────────── 输出 ──────────────────────────
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const outDir = join(__dirname, 'results');
mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, `${stamp}.json`);
const mdPath = join(outDir, `${stamp}.md`);

const all = results.flatMap((r) => (r.runs || []).map((x) => x.ms)).filter(Boolean).sort((a, b) => a - b);
const p95 = all.length ? all[Math.min(all.length - 1, Math.floor(all.length * 0.95))] : 0;
const avg = all.length ? Math.round(all.reduce((s, x) => s + x, 0) / all.length) : 0;

writeFileSync(jsonPath, JSON.stringify({
  stamp, baseUrl: BASE_URL, placeholders: ph, p95, avg, results,
}, null, 2));

const byGroup = {};
for (const r of results) (byGroup[r.group] ||= []).push(r);

let md = `# 小云评测结果 ${stamp}\n\n`;
md += `- 环境：\`${BASE_URL}\`\n- 用例数：${results.length}（含 F 组重复计 1 条）\n`;
md += `- 平均延迟：**${avg}ms** ｜ P95：**${p95}ms**\n\n`;
md += `> \`correct\` 列需人工填：0=答错/编造 · 1=部分正确 · 2=正确且完整\n`;
md += `> \`detectHit\` 是自动判定（回答里是否出现该编码），只作参考\n\n`;

for (const g of cfg.groups) {
  const rows = byGroup[g.id];
  if (!rows) continue;
  md += `## ${g.id} 组 · ${g.name}\n\n`;
  md += `| # | 问题 | 延迟 | 自动命中 | 工具 | correct | 回答摘要 |\n|---|---|---|---|---|---|---|\n`;
  for (const r of rows) {
    if (r.skipped) { md += `| ${r.id} | ${r.q} | - | - | - | - | 已跳过（${r.reason}） |\n`; continue; }
    const last = r.runs[r.runs.length - 1];
    const extra = r.runs.length > 1
      ? `（${r.runs.map((x) => x.ms + 'ms').join(' / ')}）`
      : '';
    const hit = r.auto?.detectHit === undefined ? '-' : (r.auto.detectHit ? '✅' : '❌');
    const refuse = r.auto?.refuseSignal !== undefined ? (r.auto.refuseSignal ? '拒答✅' : '拒答❌') : '';
    const summary = (last.text || last.error || '').replace(/\s+/g, ' ').slice(0, 110);
    md += `| ${r.id} | ${r.q} | ${last.ms}ms${extra} | ${hit}${refuse} | ${last.tools.length} |  | ${summary || '(空)'} |\n`;
  }
  md += '\n';
}

md += `## F 组缓存衰减（第1次 vs 第2/3次）\n\n`;
md += `| # | 第1次 | 第2次 | 第3次 | 缓存生效 |\n|---|---|---|---|---|\n`;
for (const r of byGroup.F || []) {
  const m = r.runs.map((x) => x.ms);
  const faster = m.length > 1 && m[1] < m[0] * 0.6;
  md += `| ${r.id} | ${m[0] ?? '-'}ms | ${m[1] ?? '-'}ms | ${m[2] ?? '-'}ms | ${faster ? '✅' : '❌'} |\n`;
}

writeFileSync(mdPath, md);

console.log(`\n完成。平均 ${avg}ms ｜ P95 ${p95}ms`);
console.log(`原始：${jsonPath}`);
console.log(`报告：${mdPath}\n`);
