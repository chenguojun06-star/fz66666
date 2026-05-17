import DOMPurify from 'dompurify';

export function renderSimpleMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let s = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code.trim());
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  const lines = s.split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const raw of lines) {
    const line = raw;

    const h3Match = line.match(/^###\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h1Match = line.match(/^#\s+(.+)/);
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    const tableSep = line.match(/^\|[-:\s|]+\|$/);

    if (h3Match) { closeLists(); html.push(`<h3 class="md-h3">${h3Match[1]}</h3>`); continue; }
    if (h2Match) { closeLists(); html.push(`<h2 class="md-h2">${h2Match[1]}</h2>`); continue; }
    if (h1Match) { closeLists(); html.push(`<h1 class="md-h1">${h1Match[1]}</h1>`); continue; }

    if (ulMatch) {
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul class="md-ul">'); inUl = true; }
      html.push(`<li>${inlineFmt(ulMatch[1])}</li>`);
      continue;
    }

    if (olMatch) {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol class="md-ol">'); inOl = true; }
      html.push(`<li>${inlineFmt(olMatch[1])}</li>`);
      continue;
    }

    if (tableSep) { closeLists(); continue; }

    const tableRow = line.match(/^\|(.+)\|$/);
    if (tableRow && !tableSep) {
      closeLists();
      const cells = tableRow[1].split('|').map(c => c.trim());
      const isHeader = line.includes('---') === false && html.length > 0 && !html[html.length - 1].startsWith('<tr');
      const tag = isHeader ? 'th' : 'td';
      if (isHeader && (html.length === 0 || !html[html.length - 1].startsWith('<table'))) {
        html.push('<table class="md-table"><thead>');
      }
      if (isHeader) {
        html.push(`<tr>${cells.map(c => `<${tag}>${inlineFmt(c)}</${tag}>`).join('')}</tr></thead><tbody>`);
      } else {
        html.push(`<tr>${cells.map(c => `<${tag}>${inlineFmt(c)}</${tag}>`).join('')}</tr>`);
      }
      continue;
    } else if (html.length > 0 && html[html.length - 1] === '<tbody>') {
      html.push('</tbody></table>');
    }

    closeLists();
    if (!line.trim()) { html.push('<br/>'); continue; }
    html.push(`<p class="md-p">${inlineFmt(line)}</p>`);
  }
  closeLists();
  if (html.some(h => h === '<tbody>')) html.push('</tbody></table>');

  let result = html.join('');
  result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) =>
    `<pre class="md-code-block"><code>${escHtml(codeBlocks[Number(i)])}</code></pre>`
  );
  return result;

  function closeLists() {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  }
}

function inlineFmt(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\b((?:https?:\/\/)[^\s<>"]+)/g, '<a class="md-link" href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\b((?:PO|CUT|PAT|ORD)\d{6,20})\b/g, '<a class="order-link" data-orderno="$1">$1</a>');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'div', 'br', 'span', 'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
  ALLOWED_ATTR: ['class', 'data-orderno', 'href', 'target', 'rel'],
};

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
}