import { CARE_ICONS } from './careIcons';

/**
 * 洗水唛打印数据
 *
 * 渲染原则（用户需求）：
 *  - 只显示用户输入的内容：任何字段为空/空数组 → 该分区完全不渲染，无占位提示
 *  - 全部分区标准字体、无加粗、统一字号
 *  - 分区顺序（从上到下）：码数 → 款号 → 面料成份 → 洗涤图标 → 洗涤文字 → 制造区域
 *  - 距剪口下方 topOffsetMm（默认 30mm）处开始打印
 */
export interface WashLabelPrintData {
  width: number;
  height: number;
  compositionText: string;
  washInstructionsText: string;
  careIconCodes: string[];
  manufacturingText: string;
  dateText: string;
  /** 顶部码数行（如 "S" / "M" / "L" / "XL"），用户可编辑；空则不显示 */
  sizeText?: string;
  /** 顶部款号行（如 "BR26C1S0574B"）；空则不显示 */
  styleNo?: string;
  /** 距剪口偏移（mm），内容从此处开始打印；默认 0（兼容旧调用） */
  topOffsetMm?: number;
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

function buildLabelCss(w: number, h: number, iconSize: number, topOffsetMm: number): string {
  // 统一标准字号：全部分区同一字号、无加粗（用户要求字体图标一致）
  const fs = w >= 48 ? 6.5 : 5.5;
  const bottomSafe = 2;
  const iconGap = w <= 30 ? 0.6 : 1;
  const topPad = Math.max(0, topOffsetMm || 0);

  // iframe srcDoc 是独立文档上下文，不继承父页面 CSS 变量
  // 直接用硬编码颜色，避免 var(--color-*) 在 iframe 中失效
  return `@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;min-height:${h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;color:#000;background:#fff;-webkit-font-smoothing:antialiased}
.label-page{position:relative;width:${w}mm;height:${h}mm;padding:${topPad}mm 2.2mm ${bottomSafe}mm;page-break-after:always;display:flex;flex-direction:column;align-items:center}
.label-page:last-child{page-break-after:auto}
/* 内容区：从上到下依次排列 码数→款号→成份→图标→洗涤文字→制造，全部标准字体无加粗 */
.content-block{flex:1 1 0;overflow:hidden;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;padding-top:1.5mm}
.size-line{font-size:${fs}pt;font-weight:400;letter-spacing:0.3mm;text-align:center;line-height:1.3}
.style-line{font-size:${fs}pt;font-weight:400;letter-spacing:0.3mm;text-align:center;line-height:1.3;margin-top:1mm}
.comp-mats{font-size:${fs}pt;font-weight:400;line-height:1.5;text-align:center;margin-top:1.5mm}
.icons{display:flex;flex-direction:row;gap:${iconGap}mm;align-items:center;justify-content:center;flex-wrap:nowrap;width:100%;margin-top:1.5mm}
.icon-cell{width:${iconSize}mm;height:${iconSize}mm;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.icons svg{width:100%;height:100%}
.care-wash{font-size:${fs}pt;font-weight:400;line-height:1.5;text-align:center;margin-top:1mm}
.footer{font-size:${fs}pt;font-weight:400;letter-spacing:0.3mm;line-height:1.3;text-align:center;margin-top:1.5mm}
.date{margin-top:1mm;font-size:${fs}pt;font-weight:400;color:#71717a;text-align:center;letter-spacing:0.2mm}`;
}

function buildLabelContentHtml(data: WashLabelPrintData, iconSize: number): string {
  // 只显示用户输入的内容：空值分区完全不渲染（无占位符、无默认文案）
  const sizeHtml = data.sizeText?.trim()
    ? `<div class="size-line">${escapeHtml(data.sizeText.trim())}</div>`
    : '';
  const styleHtml = data.styleNo?.trim()
    ? `<div class="style-line">${escapeHtml(data.styleNo.trim())}</div>`
    : '';
  const compositionHtml = data.compositionText?.trim()
    ? `<div class="comp-mats">${data.compositionText.replace(/\n/g, '<br/>')}</div>`
    : '';
  // 洗涤方法区：上面一排图标，下面一排文字（用户要求图标在上文字在下）
  const careIconsHtml = buildCareIconsHtml(data.careIconCodes || [], iconSize);
  const washHtml = data.washInstructionsText?.trim()
    ? `<div class="care-wash">${data.washInstructionsText.replace(/\n/g, '<br/>')}</div>`
    : '';
  const mfgHtml = data.manufacturingText?.trim()
    ? `<div class="footer">${escapeHtml(data.manufacturingText.trim())}</div>`
    : '';
  const dateHtml = data.dateText?.trim() ? `<div class="date">${escapeHtml(data.dateText.trim())}</div>` : '';

  // 只渲染用户输入的分区：不添加任何分隔线/默认文案等额外元素
  return `<div class="content-block">
      ${sizeHtml}
      ${styleHtml}
      ${compositionHtml}
      ${careIconsHtml}
      ${washHtml}
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
${buildLabelCss(w, h, iconSize, data.topOffsetMm ?? 0)}
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
  const topOffset = items[0].topOffsetMm ?? 0;

  const pagesHtml = items.map(data => {
    const content = buildLabelContentHtml(data, iconSize);
    return `<div class="label-page">
${content}
</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${buildLabelCss(w, h, iconSize, topOffset)}
</style></head><body>
${pagesHtml}
</body></html>`;
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
