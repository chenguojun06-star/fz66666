import { CARE_ICONS } from './careIcons';

/**
 * 洗水唛打印数据
 *
 * 渲染原则（用户需求）：
 *  - 只显示用户输入的内容：任何字段为空/空数组 → 该分区完全不渲染，无占位提示
 *  - 全部分区标准字体、无加粗、统一字号
 *  - 分区顺序（从上到下）：码数 → 款号 → 面料成份 → 洗涤图标 → 洗涤文字 → 制造区域
 *  - 距剪口下方 topOffsetMm（默认 30mm）处开始打印
 *
 * 2026-08-22 修复（用户反馈"文字全部被截断/图标2行"）：
 *  - 字号自动适配：按内容行数估算总高度，装不下时自动缩小字号（下限 4pt），
 *    保证所有输入文字永远完整可见，不再被 overflow:hidden 裁掉
 *  - 图标强制一排：图标数量多时按可用宽度自动缩小（下限 2.8mm），不再换行
 *  - fontScale 全局字体缩放（0.5~1.6，默认 1）：用户手动微调整体字号，
 *    调大时仍受"装得下"上限钳制，不会因此截断
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
  /** 全局字体缩放（0.5~1.6，默认 1）：用户自由调整字号，直接生效 */
  fontScale?: number;
  /** 行距/上下间距缩放（0.7~1.8，默认 1）：用户自由调整行与行之间、各分区上下之间的距离 */
  lineHeightScale?: number;
}

const PT_TO_MM = 0.3528;
/** 行高系数：正文（成份/洗涤文字）——压缩到1.32，把省下的高度让给字号，字更大 */
const LH_BODY = 1.32;
/** 行高系数：码数/款号/制造（紧凑行） */
const LH_TIGHT = 1.2;
/** 字号下限（pt）：保证可读性，一律不小于此值，绝不压到看不清 */
const MIN_FONT_PT = 5.5;
/** 图标绝对下限（mm）：仅防止 0 尺寸，"一排装得下"永远优先于图标大小 */
const MIN_ICON_MM = 0.5;

/** 图标间距（mm）：图标多时收紧间距，保证一排放得下 */
function iconGapFor(w: number, iconCount: number): number {
  if (iconCount > 8) return 0.3;
  return w <= 30 ? 0.5 : 0.8;
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

/** 理想字号（pt）：随标签宽度自适应，30mm→7.5pt、40mm→10pt、50mm→12.5pt，上限13pt */
function idealFontSize(w: number): number {
  return Math.round(Math.min(Math.max(w * 0.25, 7), 13) * 10) / 10;
}

/**
 * 估算一段文本在指定字号下的显示行数（按字符宽度累加模拟换行，中英文混合）
 * availWidthMm：可用内容宽度（已扣除左右 padding）
 */
function estimateLineCount(text: string, fsPt: number, availWidthMm: number): number {
  if (!text) return 0;
  const emMm = fsPt * PT_TO_MM;
  let total = 0;
  for (const paragraph of text.split('\n')) {
    let lineWidth = 0;
    let lines = 1;
    for (const ch of paragraph) {
      let cw: number; // 字符宽度（em 为单位）
      if (ch === ' ' || ch === '\t') cw = 0.35;
      else if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) cw = 1; // 中文/全角
      else if (/[A-Z0-9@#%&WMmw]/.test(ch)) cw = 0.75; // 宽英文字符
      else cw = 0.55; // 普通英文/数字/标点
      const adv = cw * emMm;
      if (lineWidth + adv > availWidthMm && lineWidth > 0) {
        lines++;
        lineWidth = adv;
      } else {
        lineWidth += adv;
      }
    }
    total += lines;
  }
  return total;
}

/**
 * 各分区之间的垂直间距合计（mm），与 CSS 中 margin-top 对应。
 * 统一为轻量间距：每分区之间留 0.7~0.8mm 明确空隙（不挤、清晰），
 * 把省下的垂直空间让给字号。成份与下面的图标之间留 0.7mm（用户明确要求）。
 */
const GAP_SIZE_TO_STYLE = 0.8;    // 码数 → 款号
const GAP_STYLE_TO_COMP = 0.8;    // 款号 → 成份
const GAP_COMP_TO_ICONS = 0.7;    // 成份 → 图标（用户要求 ~0.7 间隔）
const GAP_ICONS_TO_WASH = 0.8;    // 图标 → 洗涤文字
const GAP_WASH_TO_MFG = 0.8;      // 洗涤文字 → 制造
const CONTENT_PAD_TOP = 1;        // content-block padding-top

/**
 * 估算当前字号下全部内容的高度（mm）。留 5% 安全余量（字体渲染差异、letter-spacing）。
 * lhScale：行距缩放，控制行与行之间、各分区的上下距离（用户自由调整）。
 */
function estimateContentHeightMm(
  data: WashLabelPrintData, fsPt: number, iconRowH: number, availWidthMm: number, lhScale: number,
): number {
  const lhT = LH_TIGHT * lhScale;
  const lhB = LH_BODY * lhScale;
  let h = CONTENT_PAD_TOP * lhScale;
  if (data.sizeText?.trim()) {
    h += estimateLineCount(data.sizeText, fsPt, availWidthMm) * fsPt * lhT * PT_TO_MM;
  }
  if (data.styleNo?.trim()) {
    h += GAP_SIZE_TO_STYLE * lhScale;
    h += estimateLineCount(data.styleNo, fsPt, availWidthMm) * fsPt * lhT * PT_TO_MM;
  }
  if (data.compositionText?.trim()) {
    h += GAP_STYLE_TO_COMP * lhScale;
    h += estimateLineCount(data.compositionText, fsPt, availWidthMm) * fsPt * lhB * PT_TO_MM;
  }
  if ((data.careIconCodes || []).length > 0) {
    h += GAP_COMP_TO_ICONS * lhScale + iconRowH;
  }
  if (data.washInstructionsText?.trim()) {
    h += GAP_ICONS_TO_WASH * lhScale;
    h += estimateLineCount(data.washInstructionsText, fsPt, availWidthMm) * fsPt * lhB * PT_TO_MM;
  }
  if (data.manufacturingText?.trim()) {
    h += GAP_WASH_TO_MFG * lhScale;
    h += estimateLineCount(data.manufacturingText, fsPt, availWidthMm) * fsPt * lhT * PT_TO_MM;
  }
  if (data.dateText?.trim()) {
    h += 1 * lhScale + estimateLineCount(data.dateText, fsPt, availWidthMm) * fsPt * lhT * PT_TO_MM;
  }
  return h * 1.05;
}

/** 左右 padding 合计（mm），与 .label-page 的 padding 对应 */
const H_PAD = 2.2 * 2;

/**
 * 计算图标一排的行高（mm）：理想大小随标签宽度与 fontScale 缩放，
 * 但强制一排——图标数量多时按可用宽度自动缩小，绝不换行、绝不横向溢出。
 * "一排装得下"是最高优先级：宁可图标变小，也不允许换行或被裁掉。
 */
function calcIconRowHeight(w: number, iconCount: number, fontScale: number): number {
  if (iconCount <= 0) return 0;
  const availW = w - H_PAD;
  const ideal = Math.min(Math.max(w * 0.22, 5), 11) * (fontScale || 1);
  if (iconCount === 1) return Math.max(Math.min(ideal, availW), MIN_ICON_MM);
  const gap = iconGapFor(w, iconCount);
  const perIcon = (availW - gap * (iconCount - 1)) / iconCount;
  return Math.max(Math.min(ideal, perIcon), MIN_ICON_MM);
}

/**
 * 字号跟随 fontScale 的下限系数：最多只做轻微防溢出收缩（缩到理想的 90%），
 * 保证"字号滑块"真实生效——用户拖多大，字就多大；不像以前被无底线压小导致拖动无效。
 * 行距(lineHeightScale)由用户独立控制，不参与字号收缩。
 */
const FONT_SHRINK_FLOOR = 0.9;

/**
 * 计算最终字号（pt）：
 * 1. 基础字号 = 理想字号 × fontScale（用户手动缩放，直接生效）
 * 2. 防溢出微调：仅当内容偏高时从基础字号轻微缩小（下限 = 理想字号×FONT_SHRINK_FLOOR），
 *    保证字号基本跟随用户设置，同时避免内容被裁。
 * 多页批量打印时取所有页中最保守（最小）的适配字号，保证每一页都放得下。
 */
function fitFontSize(items: WashLabelPrintData[]): number {
  const first = items[0];
  const w = first.width;
  const h = first.height;
  const fontScale = first.fontScale ?? 1;
  const lineHeightScale = first.lineHeightScale ?? 1;
  const availH = h - Math.max(0, first.topOffsetMm ?? 0) - 1.5; // 扣除顶部偏移与底部安全距离
  const availW = w - H_PAD;
  const maxIconCount = Math.max(0, ...items.map(it => (it.careIconCodes || []).length));
  const iconRowH = calcIconRowHeight(w, maxIconCount, fontScale);

  const base = Math.round(idealFontSize(w) * fontScale * 10) / 10;
  const floor = Math.max(MIN_FONT_PT, Math.round(idealFontSize(w) * FONT_SHRINK_FLOOR * 10) / 10);
  let fs = base;
  while (fs > floor) {
    const worst = Math.max(...items.map(it => estimateContentHeightMm(it, fs, iconRowH, availW, lineHeightScale)));
    if (worst <= availH) break;
    fs = Math.round((fs - 0.5) * 10) / 10;
  }
  return Math.max(fs, floor);
}

function buildLabelCss(
  w: number, h: number, iconSize: number, topOffsetMm: number, fs: number, iconCount: number, lhScale: number,
): string {
  const bottomSafe = 1.5;
  const iconGap = iconGapFor(w, iconCount);
  const topPad = Math.max(0, topOffsetMm || 0);
  // 行间垂直距离 = 基础值 × 行距缩放（用户自由调整）
  const lh = lhScale || 1;
  const lhT = (LH_TIGHT * lh).toFixed(2);
  const lhB = (LH_BODY * lh).toFixed(2);
  const gSS = (GAP_SIZE_TO_STYLE * lh).toFixed(2);
  const gSC = (GAP_STYLE_TO_COMP * lh).toFixed(2);
  const gCI = (GAP_COMP_TO_ICONS * lh).toFixed(2);
  const gIW = (GAP_ICONS_TO_WASH * lh).toFixed(2);
  const gWM = (GAP_WASH_TO_MFG * lh).toFixed(2);
  const padTop = (CONTENT_PAD_TOP * lh).toFixed(2);

  // iframe srcDoc 是独立文档上下文，不继承父页面 CSS 变量
  // 直接用硬编码颜色，避免 var(--color-*) 在 iframe 中失效
  // 间距与模板计算常量保持一致(GAP_*)，行高与 LH_* 保持一致——避免估算与渲染不一致
  return `@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;min-height:${h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;color:#000;background:#fff;-webkit-font-smoothing:antialiased}
.label-page{position:relative;width:${w}mm;height:${h}mm;padding:${topPad}mm 2.2mm ${bottomSafe}mm;page-break-after:always;display:flex;flex-direction:column;align-items:center}
.label-page:last-child{page-break-after:auto}
/* 内容区：从上到下依次排列 码数→款号→成份→图标→洗涤文字→制造，全部标准字体无加粗 */
.content-block{flex:1 1 0;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;padding-top:${padTop}mm}
.size-line{font-size:${fs}pt;font-weight:400;letter-spacing:0.2mm;text-align:center;line-height:${lhT}}
.style-line{font-size:${fs}pt;font-weight:400;letter-spacing:0.2mm;text-align:center;line-height:${lhT};margin-top:${gSS}mm}
.comp-mats{font-size:${fs}pt;font-weight:400;line-height:${lhB};text-align:center;margin-top:${gSC}mm}
/* 图标强制一排：数量多时按可用宽度自动缩小，绝不换行；与成份之间留 0.7mm 空隙 */
.icons{display:flex;flex-direction:row;gap:${iconGap}mm;align-items:center;justify-content:center;flex-wrap:nowrap;width:100%;margin-top:${gCI}mm}
.icon-cell{width:${iconSize}mm;height:${iconSize}mm;display:flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:0;min-height:0}
.icons svg{width:100%;height:100%;display:block}
.care-wash{font-size:${fs}pt;font-weight:400;line-height:${lhB};text-align:center;margin-top:${gIW}mm}
.footer{font-size:${fs}pt;font-weight:400;letter-spacing:0.2mm;line-height:${lhT};text-align:center;margin-top:${gWM}mm}
.date{margin-top:${gIW}mm;font-size:${fs}pt;font-weight:400;color:#71717a;text-align:center;letter-spacing:0.2mm}`;
}

function buildLabelContentHtml(data: WashLabelPrintData, _iconSize: number): string {
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
  const careIconsHtml = buildCareIconsHtml(data.careIconCodes || [], _iconSize);
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

/** 查询自动适配后的实际字号（pt）：供配置面板显示，让用户直观看到"内容多→字变小"的约束 */
export function estimateAdaptedFontSize(data: WashLabelPrintData): number {
  return fitFontSize([data]);
}

export function buildWashLabelPrintHtml(data: WashLabelPrintData): string {
  const { width: w, height: h } = data;
  const fontScale = data.fontScale ?? 1;
  const lineHeightScale = data.lineHeightScale ?? 1;
  const iconCount = (data.careIconCodes || []).length;
  const iconSize = calcIconRowHeight(w, iconCount, fontScale);
  const fs = fitFontSize([data]);
  const labelHtml = buildLabelContentHtml(data, iconSize);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${buildLabelCss(w, h, iconSize, data.topOffsetMm ?? 0, fs, iconCount, lineHeightScale)}
</style></head><body><div class="label-page">
${labelHtml}
</div></body></html>`;
}

export function buildWashLabelMultiPageHtml(items: WashLabelPrintData[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return buildWashLabelPrintHtml(items[0]);

  const w = items[0].width;
  const h = items[0].height;
  const fontScale = items[0].fontScale ?? 1;
  const lineHeightScale = items[0].lineHeightScale ?? 1;
  const topOffset = items[0].topOffsetMm ?? 0;
  const maxIconCount = Math.max(0, ...items.map(it => (it.careIconCodes || []).length));
  const iconSize = calcIconRowHeight(w, maxIconCount, fontScale);
  // 多页取所有页最保守的字号，保证每页都放得下
  const fs = fitFontSize(items);

  const pagesHtml = items.map(data => {
    const content = buildLabelContentHtml(data, iconSize);
    return `<div class="label-page">
${content}
</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${buildLabelCss(w, h, iconSize, topOffset, fs, maxIconCount, lineHeightScale)}
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
          if (!e?.materials?.trim() && e.washNote !== undefined) {
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
