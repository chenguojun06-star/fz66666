import { CARE_ICONS } from './careIcons';

export interface WashLabelPrintData {
  width: number;
  height: number;
  compositionText: string;
  washInstructionsText: string;
  careIconCodes: string[];
  manufacturingText: string;
  dateText: string;
  /** 顶部码数行（如 "S" / "M" / "L" / "XL"），用户可编辑 */
  sizeText?: string;
  /** 顶部款号行（如 "BR26C1S0574B"） */
  styleNo?: string;
}

function buildCareIconsHtml(codes: string[], _iconSize: number): string {
  if (!codes.length) return '';
  const categoryOrder = ['wash', 'bleach', 'dry', 'iron', 'dryclean', 'naturaldry', 'special'];
  const ordered: string[] = [];
  categoryOrder.forEach(cat => {
    codes.forEach(code => {
      const def = CARE_ICONS[code];
      if (def && def.category === cat) ordered.push(def.svg);
    });
  });
  codes.forEach(code => {
    const def = CARE_ICONS[code];
    if (def && !categoryOrder.includes(def.category)) ordered.push(def.svg);
  });
  const cells = ordered.map(svg => `<span class="icon-cell">${svg}</span>`).join('');
  return cells ? `<div class="icons">${cells}</div>` : '';
}

function buildLabelCss(w: number, h: number, iconSize: number): string {
  const fs = w >= 48 ? 6.5 : 5.5;
  const bottomSafe = 12;
  const iconGap = w <= 30 ? 0.6 : 1;

  // iframe srcDoc 是独立文档上下文，不继承父页面 CSS 变量
  // 直接用硬编码颜色，避免 var(--color-*) 在 iframe 中失效
  return `@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;min-height:${h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;color:#000;background:#fff;-webkit-font-smoothing:antialiased}
.label-page{position:relative;width:${w}mm;height:${h}mm;padding:2mm 2.2mm ${bottomSafe}mm;page-break-after:always;display:flex;flex-direction:column;align-items:center}
.label-page:last-child{page-break-after:auto}
.dash-sep{border:none;border-top:0.8pt dashed #52525b;width:calc(100% + 2mm);margin-left:-1mm;flex:0 0 auto}
/* 顶部码数+款号区：码数粗体居中，款号灰色细字居中 */
.top-meta{flex:0 0 auto;width:100%;text-align:center;line-height:1.2;padding-bottom:1mm;border-bottom:0.4pt solid #d4d4d8}
.top-meta .size-line{font-size:${w <= 30 ? fs + 2 : fs + 1.5}pt;font-weight:700;letter-spacing:0.4mm}
.top-meta .style-line{font-size:${fs}pt;color:#52525b;letter-spacing:0.3mm;margin-top:0.6mm}
.content-block{flex:1 1 0;overflow:hidden;min-height:0;width:100%;text-align:center;padding-top:2mm}
.comp-mats{font-size:${w <= 30 ? fs + 1.5 : fs + 0.5}pt;line-height:1.6;font-weight:600;text-align:center}
.section-sep{width:40%;height:0;border-top:0.3pt solid #bfbfbf;margin:1.5mm auto}
.care-wash{font-size:${fs}pt;color:#3f3f46;line-height:1.6;text-align:center}
.bottom-block{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;width:100%;margin-top:auto}
.icons{display:flex;flex-direction:row;gap:${iconGap}mm;align-items:center;justify-content:center;flex-wrap:nowrap;width:100%;margin:0.5mm auto 0}
.icon-cell{width:${iconSize}mm;height:${iconSize}mm;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.icons svg{width:100%;height:100%}
.footer{margin-top:1.5mm;font-size:${w <= 30 ? fs - 0.2 : fs}pt;font-weight:700;letter-spacing:0.8mm;line-height:1.3;text-align:center;white-space:nowrap}
.date{margin-top:1mm;font-size:${fs - 0.5}pt;color:#71717a;text-align:center;letter-spacing:0.2mm}`;
}

function buildLabelContentHtml(data: WashLabelPrintData, iconSize: number): string {
  // 顶部码数+款号：用户要求"最顶部 一行码数 一行款号"，多码数打印时每页独立显示该码数
  const topMetaHtml = (data.sizeText?.trim() || data.styleNo?.trim())
    ? `<div class="top-meta">
${data.sizeText?.trim() ? `  <div class="size-line">${escapeHtml(data.sizeText.trim())}</div>` : ''}
${data.styleNo?.trim() ? `  <div class="style-line">${escapeHtml(data.styleNo.trim())}</div>` : ''}
</div>`
    : '';

  const compositionHtml = data.compositionText.trim()
    ? `<div class="comp-mats">${data.compositionText.replace(/\n/g, '<br/>')}</div>`
    : '<div class="comp-mats" style="color:#bfbfbf">（成分未填写）</div>';

  const washHtml = data.washInstructionsText.trim()
    ? `<div class="section-sep"></div><div class="care-wash">${data.washInstructionsText.replace(/\n/g, '<br/>')}</div>`
    : '';

  const careIconsHtml = buildCareIconsHtml(data.careIconCodes, iconSize);
  const careSectionHtml = careIconsHtml ? careIconsHtml : '';

  const mfgHtml = data.manufacturingText.trim() ? `<div class="footer">${data.manufacturingText}</div>` : '';
  const dateHtml = data.dateText.trim() ? `<div class="date">${data.dateText}</div>` : '';

  return `${topMetaHtml}<div class="dash-sep"></div>
    <div class="content-block">
      ${compositionHtml}
      ${washHtml}
    </div>
    <div class="bottom-block">
      ${careSectionHtml}
      ${mfgHtml}
      ${dateHtml}
    </div>`;
}

/** HTML 转义：防止码数/款号中特殊字符破坏 HTML 结构 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] as string));
}

function calcIconSize(w: number): number {
  if (w <= 30) return 5;
  if (w <= 40) return 5;
  return 6;
}

export function buildWashLabelPrintHtml(data: WashLabelPrintData): string {
  const { width: w, height: h } = data;
  const iconSize = calcIconSize(w);
  const labelHtml = buildLabelContentHtml(data, iconSize);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${buildLabelCss(w, h, iconSize)}
</style></head><body><div class="label-page">
${labelHtml}
</div></body></html>`;
}

export function buildWashLabelMultiPageHtml(items: WashLabelPrintData[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return buildWashLabelPrintHtml(items[0]);

  const w = items[0].width;
  const h = items[0].height;
  const iconSize = calcIconSize(w);

  const pagesHtml = items.map(data => {
    const content = buildLabelContentHtml(data, iconSize);
    return `<div class="label-page">
${content}
</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${buildLabelCss(w, h, iconSize)}
</style></head><body>
${pagesHtml}
</body></html>`;
}

export function getDefaultDateText(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export function compositionFromSections(
  fabricCompositionParts?: string,
  fabricComposition?: string,
): string {
  if (!fabricCompositionParts && !fabricComposition) return '';
  if (fabricCompositionParts) {
    try {
      const parsed = JSON.parse(fabricCompositionParts);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((e: any) => e?.materials?.trim());
        if (valid.length > 0) {
          return valid.map((e: any) => {
            const part = String(e.part || '').trim();
            const mats = String(e.materials || '').trim();
            return part ? `${part}：${mats}` : mats;
          }).join('\n');
        }
      }
    } catch { /* ignore */ }
  }
  return fabricComposition?.trim() || '';
}

export function washTextFromInstructions(
  washInstructions?: string,
  fabricCompositionParts?: string,
): string {
  const perPartNotes: Record<string, string> = {};
  if (fabricCompositionParts) {
    try {
      const parsed = JSON.parse(fabricCompositionParts);
      if (Array.isArray(parsed)) {
        parsed.forEach((e: any) => {
          if (!e?.materials?.trim() && e?.washNote !== undefined) {
            perPartNotes[String(e.part || '').trim()] = String(e.washNote);
          }
        });
      }
    } catch { /* ignore */ }
  }
  const keys = Object.keys(perPartNotes);
  if (keys.length > 0 && perPartNotes[keys[0]]?.trim()) {
    return perPartNotes[keys[0]].replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
  }
  return (washInstructions || '').replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
}
