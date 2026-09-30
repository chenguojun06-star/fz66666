/**
 * D-655 用户手册一键生成
 *
 * 手册不是独立维护的文档——由教程数据（tutorialData*）实时编译成打印 HTML，
 * 经 safePrint 打开打印窗口，用户选「另存为 PDF」即得离线手册。
 * 教程数据更新后手册自动跟着新（同一份数据源），封面带构建版本戳可核对新鲜度。
 *
 * 同步纪律见本目录 README.md：改了某模块界面 → 同批更新对应教程文件 → 手册即同步。
 */
import dayjs from 'dayjs';
import { tutorials } from './tutorialData';
import type { Tutorial } from './types';
import { safePrint } from '@/utils/safePrint';

declare const __BUILD_COMMIT__: string;

/** 与教程页 categories 对齐的分类名（'all' 除外）；未知 key 兜底显示 key 本身 */
const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': '入门指南',
  'sample': '样衣管理',
  'production': '生产管理',
  'warehouse': '仓储管理',
  'mobile': '小程序操作',
  'finance': '财务管理',
  'system': '系统设置',
  'intelligence': '智能运营',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
};

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 按分类分组（保持 CATEGORY_LABELS 的顺序，未知名靠后） */
function groupByCategory(list: Tutorial[]): Array<{ key: string; label: string; items: Tutorial[] }> {
  const groups: Array<{ key: string; label: string; items: Tutorial[] }> = [];
  const byKey = new Map<string, { key: string; label: string; items: Tutorial[] }>();
  for (const t of list) {
    let g = byKey.get(t.category);
    if (!g) {
      g = { key: t.category, label: CATEGORY_LABELS[t.category] || t.category, items: [] };
      byKey.set(t.category, g);
      groups.push(g);
    }
    g.items.push(t);
  }
  // 固定顺序排前，其余按首次出现
  const order = Object.keys(CATEGORY_LABELS);
  groups.sort((a, b) => {
    const ia = order.indexOf(a.key); const ib = order.indexOf(b.key);
    return (ia === -1 ? order.length + groups.indexOf(a) : ia) - (ib === -1 ? order.length + groups.indexOf(b) : ib);
  });
  return groups;
}

function renderTutorial(t: Tutorial): string {
  const steps = t.steps.map((s, i) => `
    <li class="manual-step">
      <div class="manual-step-title">${i + 1}. ${escapeHtml(s.title)}</div>
      <div class="manual-step-desc">${escapeHtml(s.description)}</div>
      ${s.image ? `<img class="manual-img" src="${escapeHtml(s.image)}" alt="" />` : ''}
      ${(s.tips?.length ?? 0) > 0 ? `<div class="manual-tips"><span class="manual-tips-label">温馨提示</span><ul>${s.tips!.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul></div>` : ''}
    </li>`).join('');

  const faqs = (t.faqs?.length ?? 0) > 0
    ? `<div class="manual-faq"><div class="manual-block-title">常见问题</div>${t.faqs!.map((f) => `
        <div class="manual-faq-item"><strong>问：${escapeHtml(f.question)}</strong><br />答：${escapeHtml(f.answer)}</div>`).join('')}</div>`
    : '';

  const video = t.videoUrl
    ? `<div class="manual-video">视频教程：<span style="text-decoration:underline;">${escapeHtml(t.videoUrl)}</span>（可在系统教程中心在线观看）</div>`
    : '';

  const metaBits = [
    DIFFICULTY_LABELS[t.difficulty] ? `难度：${DIFFICULTY_LABELS[t.difficulty]}` : '',
    t.duration ? `预计时长：${escapeHtml(t.duration)}` : '',
    t.tags?.length ? `标签：${t.tags.map(escapeHtml).join(' / ')}` : '',
  ].filter(Boolean).join('　|　');

  return `
  <section class="manual-tutorial">
    <h2>${escapeHtml(t.title)}</h2>
    ${metaBits ? `<div class="manual-meta">${metaBits}</div>` : ''}
    ${t.steps.length > 0 ? `<ol class="manual-steps">${steps}</ol>` : ''}
    ${faqs}
    ${video}
  </section>`;
}

/** 编译整册 HTML */
export function buildUserManualHtml(): string {
  const groups = groupByCategory(tutorials);
  const totalTutorials = tutorials.length;
  const totalCategories = groups.length;
  const buildCommit = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';
  const generatedAt = dayjs().format('YYYY年M月D日 HH:mm');

  const toc = groups.map((g) => `
    <div class="manual-toc-group">
      <div class="manual-toc-cat">${escapeHtml(g.label)}</div>
      <ol>${g.items.map((t) => `<li>${escapeHtml(t.title)}</li>`).join('')}</ol>
    </div>`).join('');

  const body = groups.map((g) => `
    <div class="manual-cat" style="page-break-before:always;">
      <h1>${escapeHtml(g.label)}</h1>
      ${g.items.map(renderTutorial).join('')}
    </div>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>云裳智链 · 用户手册</title>
<style>
  body { margin: 0; padding: 0 8mm; font-size: 12px; line-height: 1.7; }
  h1 { font-size: 20px; text-align: center; margin: 18px 0 6px; }
  h2 { font-size: 16px; margin: 18px 0 4px; padding-bottom: 4px; border-bottom: 1px solid #dddddd; }
  .manual-cover { page-break-after: always; text-align: center; padding-top: 90mm; }
  .manual-cover-title { font-size: 30px; font-weight: 700; margin-bottom: 10px; }
  .manual-cover-sub { font-size: 14px; color: #666666; margin-bottom: 26px; }
  .manual-cover-meta { font-size: 12px; color: #666666; line-height: 2; }
  .manual-toc { page-break-after: always; }
  .manual-toc-cat { font-size: 14px; font-weight: 700; margin: 10px 0 2px; }
  .manual-toc-group ol { margin: 0 0 6px; padding-left: 22px; }
  .manual-meta { font-size: 11px; color: #666666; margin-bottom: 6px; }
  .manual-steps { padding-left: 6px; list-style: none; margin: 6px 0; }
  .manual-step { margin-bottom: 8px; page-break-inside: avoid; }
  .manual-step-title { font-weight: 700; }
  .manual-step-desc { margin: 2px 0 4px; }
  .manual-img { max-width: 88%; max-height: 70mm; display: block; margin: 4px 0; border: 1px solid #eeeeee; }
  .manual-tips { background: #f6ffed; border: 1px solid #b7eb8f; padding: 6px 10px; margin: 4px 0; page-break-inside: avoid; }
  .manual-tips-label { font-weight: 700; color: #389e0d; }
  .manual-tips ul { margin: 2px 0 0; padding-left: 18px; }
  .manual-faq { margin-top: 8px; }
  .manual-block-title { font-weight: 700; margin-bottom: 4px; }
  .manual-faq-item { margin-bottom: 6px; page-break-inside: avoid; }
  .manual-video { font-size: 11px; color: #666666; margin-top: 6px; }
</style>
</head>
<body>
  <div class="manual-cover">
    <div class="manual-cover-title">云裳智链 · 用户手册</div>
    <div class="manual-cover-sub">本手册由系统「教程中心」数据自动生成，与教程中心内容同源；界面如有更新，以系统实际为准</div>
    <div class="manual-cover-meta">
      生成日期：${generatedAt}<br />
      系统版本：${escapeHtml(buildCommit || 'unknown')}<br />
      收录：${totalCategories} 个分类 · ${totalTutorials} 篇教程
    </div>
  </div>
  <div class="manual-toc">
    <h1>目 录</h1>
    ${toc}
  </div>
  ${body}
</body>
</html>`;
}

/** 打开打印窗口（浏览器「另存为 PDF」即得离线手册）；教程截图较多，放宽图片等待预算 */
export function printUserManual(): boolean {
  return safePrint(buildUserManualHtml(), '用户手册', { imageWaitMs: 8000 });
}
