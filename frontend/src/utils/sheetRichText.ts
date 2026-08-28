/**
 * 工艺说明富文本（style.description）工具
 *
 * 数据形态：
 * - 老数据：纯文本（\n 分行）
 * - D-187 起编辑器带格式工具栏：轻量 HTML——文本排版标签（b/i/u/s/p/div/h1-h3/ul/ol/
 *   table 等）+ 安全内联样式 + <img src>（附件库 URL）
 *
 * 统一走白名单过滤输出，防止任意入口（OCR 追加、历史数据、粘贴）带入任意标签；
 * 同时剥离历史日志脏行（D-069 之前日志曾被 append 进 description，见 LOG_LINE_RE）。
 */

const escText = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** 历史日志脏行：D-069 前系统往 description 追加的操作日志（如 "[2026-08-09 20:16:25] 李老板 BOM库存检查：…"） */
const LOG_LINE_RE = /^\s*[【[]\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?[】\]]\s/;

/** 文本剥脏行后转义，\n→<br>（脏行整行丢弃，用户看不到系统日志） */
const escTextLines = (s: string) => s
  .split(/\r\n|\r|\n/)
  .filter((line) => !LOG_LINE_RE.test(line))
  .map(escText)
  .join('<br>');

/** 允许保留的排版标签（闭合与开启都按此白名单；其余标签剥除留文字） */
const ALLOWED_TAGS = new Set([
  'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
  'p', 'div', 'span', 'font', 'h1', 'h2', 'h3', 'h4', 'blockquote',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
]);

/** 富文本判定：含白名单内任意标签即视为 HTML（D-188 修正——旧版只认 img/br，
 *  导致"加粗一行字"这类无换行无图的格式内容被当纯文本整体转义，工具栏一点就满屏乱码） */
const HTML_TAG_RE = /<(\/)?(b|strong|i|em|u|s|strike|del|span|div|p|font|h[1-4]|blockquote|ul|ol|li|table|thead|tbody|tr|td|th|br|img)\b/i;

/** 双转义自愈：存量数据里 &lt;span…&gt; 已烙成文字，解码还原为真标签 */
const ESCAPED_TAG_RE = /&lt;(\/?(?:b|strong|i|em|u|s|strike|del|span|div|p|font|h[1-4]|blockquote|ul|ol|li|table|thead|tbody|tr|td|th|br|img)\b[^&>]*?)&gt;/gi;

/** D-169：Word 形状粘贴会产生多层转义（&amp;lt; 甚至 &amp;amp;gt;），
 *  一层解码不够——循环解码 &amp; 与已转义标签直到内容稳定（上限 6 轮防死循环） */
const unescapeDoubleEscapedTags = (s: string): string => {
  if (!/&(lt|amp)\s*;?\s*\/?[a-zA-Z]/i.test(s) && !/&amp;lt;/i.test(s)) return s;
  let prev = s;
  for (let i = 0; i < 6; i++) {
    let next = prev.replace(/&amp;/gi, '&');
    next = next.replace(ESCAPED_TAG_RE, '<$1>');
    if (next === prev) break;
    prev = next;
  }
  return prev;
};

/** 是否为制单富文本（含白名单排版标签/内嵌图片/换行标签） */
export const isSheetRichHtml = (raw: unknown): boolean => HTML_TAG_RE.test(String(raw ?? ''));

/** 纯文本转编辑器 HTML（老数据回显用；剥脏行 + 转义，\n→<br>） */
export const plainTextToSheetHtml = (raw: unknown): string => {
  const s = String(raw ?? '');
  if (!s) return '';
  const healed = unescapeDoubleEscapedTags(s);
  if (isSheetRichHtml(healed)) return sanitizeSheetRichHtml(healed); // 已是 HTML：白名单清洗后回显
  return escTextLines(healed);
};

/** 允许保留的内联样式属性（值不得含 url()/expression()，防注入）。
 *  text-decoration-line/style：Chrome styleWithCSS 下删除线/下划线产出的是这两个属性，缺了会静默丢格式 */
const ALLOWED_STYLE_PROPS = new Set([
  'text-align', 'color', 'background-color', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line', 'text-decoration-style', 'line-height', 'font-size',
  'border', 'border-collapse', 'padding', 'margin', 'width', 'min-width',
  'vertical-align', 'white-space',
]);

const safeStyleValue = (v: string) => !/url\s*\(|expression\s*\(|position\s*:|javascript:/i.test(v);

/** 重建标签的 style 属性：仅保留白名单属性+安全值 */
const filterStyleAttr = (tagMarkup: string): string => {
  const styleMatch = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(tagMarkup);
  const withoutStyle = tagMarkup.replace(/\s*style\s*=\s*(["'])[^"']*\1/i, '');
  if (!styleMatch) return withoutStyle;
  const raw = styleMatch[1] ?? styleMatch[2] ?? '';
  const kept = raw
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .filter((pair) => {
      const idx = pair.indexOf(':');
      if (idx <= 0) return false;
      const prop = pair.slice(0, idx).trim().toLowerCase();
      const val = pair.slice(idx + 1).trim();
      return ALLOWED_STYLE_PROPS.has(prop) && safeStyleValue(val);
    })
    .join('; ');
  if (!kept) return withoutStyle;
  const selfClosed = /\/>$/.test(withoutStyle);
  const base = withoutStyle.replace(/\s*\/?>$/, '');
  return `${base} style="${escText(kept)}"${selfClosed ? ' />' : '>'}`;
};

/**
 * 白名单过滤为安全的打印/展示 HTML（D-187 扩展）：
 * - 排版标签白名单保留（加粗/标题/对齐/列表/表格等），style 属性仅留安全子集
 * - <img src> 保留（可选加样式、URL 解析包装）
 * - 其余标签全部剥除（文字保留）
 * - 文本剥历史日志脏行 + 转义，\n→<br>
 */
export const sanitizeSheetRichHtml = (
  raw: unknown,
  opts?: { imgStyle?: string; resolveUrl?: (u: string) => string }
): string => {
  const s = String(raw ?? '');
  if (!s) return '';
  const imgStyle = opts?.imgStyle ?? '';
  const resolveUrl = opts?.resolveUrl;
  const parts: string[] = [];
  const re = /<img\b[^>]*>|<[^>]+>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    parts.push(escTextLines(s.slice(last, m.index)));
    const tag = m[0];
    const tagName = (/^<\/?\s*([a-zA-Z0-9]+)/.exec(tag)?.[1] ?? '').toLowerCase();
    if (tagName === 'img') {
      const src = /src=["']([^"']+)["']/i.exec(tag);
      if (src && src[1]) {
        const url = resolveUrl ? resolveUrl(src[1]) : src[1];
        parts.push(`<img src="${escText(url)}" style="${imgStyle}" />`);
      }
    } else if (ALLOWED_TAGS.has(tagName)) {
      const isClose = tag.startsWith('</');
      if (isClose) {
        parts.push(`</${tagName}>`);
      } else if (tagName === 'br') {
        parts.push('<br>');
      } else {
        const selfClosed = /\/>$/.test(tag);
        parts.push(selfClosed ? filterStyleAttr(tag) : filterStyleAttr(tag));
      }
    }
    // 白名单外标签：整体丢弃，仅保留内部文字（由下一轮文本块承接）
    last = m.index + tag.length;
  }
  parts.push(escTextLines(s.slice(last)));
  return parts.join('');
};
