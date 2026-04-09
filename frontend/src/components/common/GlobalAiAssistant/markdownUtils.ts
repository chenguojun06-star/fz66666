/** 轻量 Markdown → HTML（仅处理 AI 常用的格式） */
export function renderSimpleMarkdown(text: string): string {
  // 先保护代码块
  const codeBlocks: string[] = [];
  let s = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code.trim());
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  // 按行处理
  const lines = s.split('\n');
  const html: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw;
    const h3Match = line.match(/^###\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h1Match = line.match(/^#\s+(.+)/);
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    // 标题
    if (h3Match) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:8px 0 4px;font-size:14px">${h3Match[1]}</strong>`);
      continue;
    }
    if (h2Match) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:10px 0 4px;font-size:15px">${h2Match[1]}</strong>`);
      continue;
    }
    if (h1Match) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:12px 0 6px;font-size:16px">${h1Match[1]}</strong>`);
      continue;
    }
    // 无序列表
    if (ulMatch) {
      if (!inList) { html.push('<ul style="margin:4px 0;padding-left:20px">'); inList = true; }
      html.push(`<li>${inlineFmt(ulMatch[1])}</li>`);
      continue;
    }
    // 有序列表
    if (olMatch) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<div style="margin:2px 0">${inlineFmt(line)}</div>`);
      continue;
    }
    if (inList) { html.push('</ul>'); inList = false; }
    // 空行
    if (!line.trim()) { html.push('<br/>'); continue; }
    // 普通段落
    html.push(`<div style="margin:2px 0">${inlineFmt(line)}</div>`);
  }
  if (inList) html.push('</ul>');
  let result = html.join('');
  // 还原代码块
  result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) =>
    `<pre style="background:#f5f5f5;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin:6px 0"><code>${escHtml(codeBlocks[Number(i)])}</code></pre>`
  );
  return result;
}

function inlineFmt(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    .replace(/\b(PO\d{8,15})\b/g, '<a class="order-link" data-orderno="$1" style="cursor:pointer">$1</a>');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 白名单 HTML 标签清理（defense-in-depth，防止 XSS） */
const ALLOWED_TAGS = /^<\/?(strong|em|code|pre|ul|li|ol|div|br|span|p|a|h[1-6]|table|thead|tbody|tr|td|th)(\s[^>]*)?\/?>$/i;

export function sanitizeHtml(html: string): string {
  return html.replace(/<\/?[^>]+(>|$)/g, (tag) => {
    if (ALLOWED_TAGS.test(tag)) return tag;
    return tag.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}
