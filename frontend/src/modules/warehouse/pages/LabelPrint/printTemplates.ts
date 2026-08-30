import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { buildWashLabelPrintHtml, buildWashLabelMultiPageHtml, compositionFromSections, washTextFromInstructions, type WashLabelPrintData } from '@/utils/washLabelPrintTemplate';
import { getEffectiveCareIconCodes } from '@/utils/careIcons';
import type { OrderInfo } from './types';
import type { BarSettings, WashSettings } from './constants';

/** 今天日期（yyyy-MM-dd）：洗水唛勾选日期且未填写时的默认值 */
function todayText(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Generate an inline SVG string for Code128 barcode (for print HTML) */
export const generateBarcodeSvgString = (value: string): string => {
  try {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgEl, value, { format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 10, margin: 0, background: 'transparent' });
    return svgEl.outerHTML;
  } catch {
    return '';
  }
};

export const buildBarcodeHtml = async (
  order: OrderInfo,
  selectedColor: string,
  selectedSize: string | string[],
  bar: BarSettings,
  count: number,
): Promise<string> => {
  if (!order) return '';
  // D-155：支持多尺码批量——每个尺码各生成 count 张
  const sizes = Array.isArray(selectedSize) ? (selectedSize.length ? selectedSize : ['']) : [selectedSize];
  const cs = bar.codeSz; const ts = bar.textSz;
  const isBarcode128 = bar.codeType === 'barcode128';
  const qrDataUrlBySize: Record<string, string> = {};
  if (!isBarcode128) {
    for (const size of sizes) {
      const sizeSku = `${order.styleNo}-${selectedColor}-${size}`;
      qrDataUrlBySize[size] = await QRCode.toDataURL(sizeSku, { width: 160, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '');
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${bar.w}mm ${bar.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${bar.w}mm;min-height:${bar.h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:#000;background:#fff;-webkit-font-smoothing:antialiased}
.lb{width:${bar.w}mm;height:${bar.h}mm;page-break-after:always;display:flex;align-items:center;padding:1.5mm 2.5mm;border:0.6pt solid #333333;position:relative}
.lb:last-child{page-break-after:auto}
.lb img{height:${bar.h * 0.65}mm;width:auto;margin-right:2.5mm;flex-shrink:0}
.lb .barcode-wrap{height:${bar.h * 0.65}mm;width:auto;margin-right:2.5mm;flex-shrink:0;display:flex;align-items:center}
.lb .barcode-wrap svg{height:100%;width:auto}
.lb .i{flex:1;display:flex;flex-direction:column;gap:0.5mm;overflow:hidden;min-width:0}
.lb .c{font-size:${cs}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.2mm}
.lb .n{font-size:${ts}pt;color:#52525b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb .s{font-size:${ts * 0.85}pt;color:#888888;letter-spacing:0.2mm}
</style></head><body>
${sizes.flatMap(size => {
  const sizeSku = `${order.styleNo}-${selectedColor}-${size}`;
  const sizeImg = isBarcode128
    ? `<div class="barcode-wrap">${generateBarcodeSvgString(sizeSku)}</div>`
    : `<img src="${qrDataUrlBySize[size] || ''}" />`;
  return Array.from({ length: count }, () => `<div class="lb">
${sizeImg}
<div class="i"><div class="c">${sizeSku}</div>${bar.showName ? `<div class="n">${order.styleName}</div>` : ''}<div class="s">${selectedColor} / ${size}</div></div>
</div>`);
}).join('\n')}
</body></html>`;
};

/**
 * D-232：洗水唛改用「分区配置」内容（用户在面板里编辑什么就打印什么）。
 * 旧的零散开关模型（showComposition / showWashInstructions / showCareIcons）已废弃，
 * 为兼容历史模板：分区文本为空时回落到订单的款式资料，老模板仍能正常打印。
 *
 * @param sizeTexts 按打印行顺序的码数列表；超过 1 个时每个尺码单独出一张（与吊牌按行出牌一致）
 */
export const buildWashlabelHtml = async (
  order: OrderInfo,
  wash: WashSettings,
  count: number,
  sizeTexts?: string[],
): Promise<string> => {
  if (!order) return '';

  // 旧数据/旧模板的回落值（分区里没有用户填写内容时使用）
  const fallbackComposition = compositionFromSections(order.fabricCompositionParts, order.fabricComposition);
  const fallbackWash = washTextFromInstructions(order.washInstructions, order.fabricCompositionParts);
  const fallbackIcons = getEffectiveCareIconCodes(
    order.careIconCodes,
    {
      washTempCode: order.washTempCode,
      bleachCode: order.bleachCode,
      tumbleDryCode: order.tumbleDryCode,
      ironCode: order.ironCode,
      dryCleanCode: order.dryCleanCode,
    },
    order.washInstructions,
  );

  const makeData = (sizeText?: string): WashLabelPrintData => ({
    width: wash.w,
    height: wash.h,
    compositionText: wash.showComposition ? (wash.compositionText || fallbackComposition) : '',
    washInstructionsText: wash.showWash ? (wash.washText || fallbackWash) : '',
    careIconCodes: wash.showWash
      ? (wash.careIconCodes?.length ? wash.careIconCodes : fallbackIcons)
      : [],
    // 只显示用户输入的内容：无 MADE IN CHINA 兜底
    manufacturingText: wash.showManufacturing ? (wash.manufacturingText || '') : '',
    // 日期：勾选即显示（留空回落当天日期），不勾选不显示
    dateText: wash.showDate ? (wash.dateText || todayText()) : '',
    // 码数/款号区：只显示用户输入内容；款号留空时回落订单款号
    sizeText: wash.showSize ? (sizeText ?? wash.sizeText ?? '').trim() : '',
    styleNo: wash.showStyleNo ? ((wash.styleNoText || '').trim() || (order.styleNo || '').trim()) : '',
    // 距剪口偏移：内容从剪口下方此处开始打印
    topOffsetMm: wash.topOffsetMm,
    // 全局字体缩放 + 行距 + 成份-洗涤间隔（旧 localStorage 无此字段时回落 0=紧凑）
    fontScale: wash.fontScale,
    lineHeightScale: wash.lineHeightScale,
    sectionGapMm: wash.sectionGapMm ?? 0,
  });

  // 批量多码：每个尺码单独一页
  if (sizeTexts && sizeTexts.length > 1) {
    return buildWashLabelMultiPageHtml(sizeTexts.map(makeData));
  }
  const printData = makeData(sizeTexts?.[0]);
  if (count <= 1) return buildWashLabelPrintHtml(printData);
  return buildWashLabelMultiPageHtml(Array.from({ length: count }, () => printData));
};
