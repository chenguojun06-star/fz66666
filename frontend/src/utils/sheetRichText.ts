/**
 * 工艺制单富文本（生产要求 description）工具
 *
 * 数据形态：
 * - 老数据：纯文本（\n 分行）
 * - 新数据：轻量 HTML——仅 <img src>（附件库 URL）+ <br> + 文本
 *
 * 编辑器粘贴已被拦截（只 insertText / insertImage），但仍统一走白名单过滤输出，
 * 防止其它入口（OCR 追加、历史数据）带入任意标签。
 */

const escText = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** 是否为制单富文本（含内嵌图片/换行标签） */
export const isSheetRichHtml = (raw: unknown): boolean => {
  const s = String(raw ?? '');
  return /<img\b/i.test(s) || /<br\s*\/?>/i.test(s);
};

/** 纯文本转编辑器 HTML（老数据回显用；文本整体转义，\n→<br>） */
export const plainTextToSheetHtml = (raw: unknown): string => {
  const s = String(raw ?? '');
  if (!s) return '';
  if (isSheetRichHtml(s)) return s; // 已是 HTML 原样返回
  return escText(s).replace(/\r\n|\r|\n/g, '<br>');
};

/**
 * 白名单过滤为安全的打印/展示 HTML：
 * - <img src> 保留（可选加样式、URL 解析包装）
 * - <br> 保留；其余标签全部剥除（文字保留）
 * - 裸文本转义，\n→<br>
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
  const re = /<img\b[^>]*>|<br\s*\/?>|<[^>]+>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    parts.push(escText(s.slice(last, m.index)).replace(/\r\n|\r|\n/g, '<br>'));
    const tag = m[0].toLowerCase();
    if (tag.startsWith('<img')) {
      const src = /src=["']([^"']+)["']/i.exec(m[0]);
      if (src && src[1]) {
        const url = resolveUrl ? resolveUrl(src[1]) : src[1];
        parts.push(`<img src="${escText(url)}" style="${imgStyle}" />`);
      }
    } else if (tag.startsWith('<br')) {
      parts.push('<br>');
    }
    last = m.index + m[0].length;
  }
  parts.push(escText(s.slice(last)).replace(/\r\n|\r|\n/g, '<br>'));
  return parts.join('');
};
