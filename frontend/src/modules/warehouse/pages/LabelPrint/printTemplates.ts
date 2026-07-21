import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { formatMoney } from '@/utils/format';
import { buildWashLabelPrintHtml, buildWashLabelMultiPageHtml, getDefaultDateText, compositionFromSections, washTextFromInstructions, type WashLabelPrintData } from '@/utils/washLabelPrintTemplate';
import { getEffectiveCareIconCodes } from '@/utils/careIcons';
import type { OrderInfo } from './types';
import type { HangSettings, BarSettings, WashSettings } from './constants';

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

export const buildHangtagHtml = async (
  order: OrderInfo,
  selectedColor: string,
  selectedSize: string,
  hang: HangSettings,
  coverBase64: string,
  count: number,
): Promise<string> => {
  if (!order) return '';
  const sku = `${order.styleNo}-${selectedColor}-${selectedSize}`;
  const qrUrl = hang.showQr ? await QRCode.toDataURL(sku, { width: 200, margin: 1, errorCorrectionLevel: 'M' }).catch(() => '') : '';
  const barcodeSvgStr = hang.showBarcode ? generateBarcodeSvgString(order.uCode || order.styleNo) : '';
  const brand = hang.brandName || order.styleName || order.styleNo;
  const imgHtml = hang.showImage && coverBase64 ? `<img class="img" src="${coverBase64}" />` : '';
  const ts = hang.titleSz; const isz = hang.infoSz;

  const infoRows: string[] = [];
  if (hang.showStyleNo) infoRows.push(`<div class="row"><span class="lbl">款号</span><span class="val">${order.styleNo}</span></div>`);
  if (hang.showColorSize) {
    infoRows.push(`<div class="row"><span class="lbl">颜色</span><span class="val">${selectedColor}</span></div>`);
    infoRows.push(`<div class="row"><span class="lbl">尺码</span><span class="val">${selectedSize}</span></div>`);
  }
  if (hang.showComposition && order.fabricComposition) infoRows.push(`<div class="row"><span class="lbl">成分</span><span class="val">${order.fabricComposition}</span></div>`);
  if (hang.showQualityGrade && order.qualityGrade) infoRows.push(`<div class="row"><span class="lbl">质量等级</span><span class="val">${order.qualityGrade}</span></div>`);
  if (hang.showExecuteStandard && order.executeStandard) infoRows.push(`<div class="row"><span class="lbl">执行标准</span><span class="val">${order.executeStandard}</span></div>`);
  if (hang.showSafetyCategory && order.safetyCategory) infoRows.push(`<div class="row"><span class="lbl">安全类别</span><span class="val">${order.safetyCategory}</span></div>`);
  if (hang.showOrderNo) infoRows.push(`<div class="row"><span class="lbl">订单号</span><span class="val">${order.orderNo}</span></div>`);

  const certRows: string[] = [];
  if (hang.showInspector && order.inspector) certRows.push(`<div class="cert-row"><span class="cert-lbl">检验员</span><span class="cert-val">${order.inspector}</span></div>`);
  if (hang.showInspectionDate && order.inspectionDate) certRows.push(`<div class="cert-row"><span class="cert-lbl">检验日期</span><span class="cert-val">${order.inspectionDate}</span></div>`);

  const hasCert = certRows.length > 0;
  const hasPrice = hang.showPrice && order.price;
  const hasUCode = hang.showUCode && order.uCode;

  const certHtml = hasCert ? `<div class="cert-box"><div class="cert-title">合 格 证</div>${certRows.join('')}</div>` : '';
  const priceHtml = hasPrice ? `<div class="price">${formatMoney(order.price!)}</div>` : '';
  const ucodeHtml = hasUCode ? `<div class="ucode">${order.uCode}</div>` : '';
  const bottomHtml = (hasPrice || hasUCode) ? `<div class="bottom-bar">${ucodeHtml}${priceHtml}</div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${hang.w}mm ${hang.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${hang.w}mm;min-height:${hang.h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:var(--color-text-primary);background:var(--color-bg-base);-webkit-font-smoothing:antialiased}
.tag{width:${hang.w}mm;height:${hang.h}mm;page-break-after:always;display:flex;flex-direction:column;overflow:hidden;position:relative}
.tag:last-child{page-break-after:auto}
.tag::before{content:'';position:absolute;inset:0;border:1.2pt solid #222;pointer-events:none}
.tag::after{content:'';position:absolute;inset:1.6mm;border:0.4pt solid #999;pointer-events:none}
.inner{padding:4mm 5.5mm;display:flex;flex-direction:column;height:100%;position:relative;z-index:1}
.img{width:100%;max-height:${Math.round(hang.h * 0.28)}mm;object-fit:contain;margin-bottom:2.5mm;border-radius:0.5mm}
.brand{text-align:center;padding-bottom:2.5mm;margin-bottom:2.5mm;position:relative}
.brand-name{font-size:${ts}pt;font-weight:800;letter-spacing:2.5mm;color:#111;line-height:1.3}
.brand-line{width:60%;height:0;border-top:0.8pt solid #222;margin:1.8mm auto 0}
.brand-line::after{content:'';display:block;width:30%;height:0;border-top:0.4pt solid #999;margin:0.8mm auto 0}
.info{flex:1;display:flex;flex-direction:column;justify-content:flex-start}
.row{display:flex;align-items:baseline;padding:0.7mm 0;border-bottom:0.2pt solid #e0e0e0;font-size:${isz}pt;line-height:1.5}
.row:last-child{border-bottom:none}
.lbl{color:#888;min-width:13mm;white-space:nowrap;font-weight:400;flex-shrink:0}
.val{font-weight:600;color:var(--color-text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cert-box{margin-top:auto;border:0.6pt solid #555;padding:1.5mm 2.5mm;position:relative}
.cert-title{font-size:${isz + 0.5}pt;font-weight:700;text-align:center;letter-spacing:2mm;color:#222;margin-bottom:1mm;padding-bottom:0.8mm;border-bottom:0.3pt solid #bbb}
.cert-row{display:flex;align-items:baseline;font-size:${isz - 0.3}pt;padding:0.3mm 0}
.cert-lbl{color:#888;min-width:13mm}
.cert-val{font-weight:600;color:#222}
.bottom-bar{display:flex;justify-content:space-between;align-items:flex-end;padding-top:1.5mm;margin-top:1.5mm;border-top:0.3pt solid #ccc}
.ucode{font-size:${isz - 0.5}pt;color:#888;letter-spacing:0.3mm}
.price{font-size:${ts * 1.15}pt;font-weight:800;color:#c00;letter-spacing:0.5mm}
${hang.showQr ? '.qr{width:14mm;height:auto;margin:1mm auto 0;display:block}' : ''}
${hang.showBarcode ? '.barcode{width:30mm;height:auto;margin:1mm auto 0;display:block}' : ''}
</style></head><body>
${Array.from({ length: count }, () => `<div class="tag"><div class="inner">
${imgHtml}
<div class="brand"><div class="brand-name">${brand}</div><div class="brand-line"></div></div>
<div class="info">${infoRows.join('')}</div>
${certHtml}
${bottomHtml}
${hang.showQr ? `<img class="qr" src="${qrUrl}" />` : ''}
${hang.showBarcode ? `<div class="barcode">${barcodeSvgStr}</div>` : ''}
</div></div>`).join('\n')}
</body></html>`;
};

export const buildBarcodeHtml = async (
  order: OrderInfo,
  selectedColor: string,
  selectedSize: string,
  bar: BarSettings,
  count: number,
): Promise<string> => {
  if (!order) return '';
  const sku = `${order.styleNo}-${selectedColor}-${selectedSize}`;
  const cs = bar.codeSz; const ts = bar.textSz;
  const isBarcode128 = bar.codeType === 'barcode128';
  const codeImgHtml = isBarcode128
    ? `<div class="barcode-wrap">${generateBarcodeSvgString(sku)}</div>`
    : `<img src="${await QRCode.toDataURL(sku, { width: 160, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '')}" />`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${bar.w}mm ${bar.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${bar.w}mm;min-height:${bar.h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:#000;background:var(--color-bg-base);-webkit-font-smoothing:antialiased}
.lb{width:${bar.w}mm;height:${bar.h}mm;page-break-after:always;display:flex;align-items:center;padding:1.5mm 2.5mm;border:0.6pt solid #333;position:relative}
.lb:last-child{page-break-after:auto}
.lb img{height:${bar.h * 0.65}mm;width:auto;margin-right:2.5mm;flex-shrink:0}
.lb .barcode-wrap{height:${bar.h * 0.65}mm;width:auto;margin-right:2.5mm;flex-shrink:0;display:flex;align-items:center}
.lb .barcode-wrap svg{height:100%;width:auto}
.lb .i{flex:1;display:flex;flex-direction:column;gap:0.5mm;overflow:hidden;min-width:0}
.lb .c{font-size:${cs}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.2mm}
.lb .n{font-size:${ts}pt;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb .s{font-size:${ts * 0.85}pt;color:#888;letter-spacing:0.2mm}
</style></head><body>
${Array.from({ length: count }, () => `<div class="lb">
${codeImgHtml}
<div class="i"><div class="c">${sku}</div>${bar.showName ? `<div class="n">${order.styleName}</div>` : ''}<div class="s">${selectedColor} / ${selectedSize}</div></div>
</div>`).join('\n')}
</body></html>`;
};

export const buildWashlabelHtml = async (
  order: OrderInfo,
  wash: WashSettings,
  count: number,
): Promise<string> => {
  if (!order) return '';
  const careCodes = wash.showCareIcons ? getEffectiveCareIconCodes(
    order.careIconCodes,
    { washTempCode: order.washTempCode, bleachCode: order.bleachCode, tumbleDryCode: order.tumbleDryCode, ironCode: order.ironCode, dryCleanCode: order.dryCleanCode },
    order.washInstructions,
  ) : [];

  const compositionText = wash.showComposition
    ? compositionFromSections(order.fabricCompositionParts, order.fabricComposition)
    : '';
  const washInstructionsText = wash.showWashInstructions
    ? washTextFromInstructions(order.washInstructions, order.fabricCompositionParts)
    : '';
  const manufacturingText = wash.showManufacturing
    ? (wash.manufacturingText || 'MADE IN CHINA')
    : '';
  const dateText = wash.showDate
    ? (wash.dateText || getDefaultDateText())
    : '';

  const printData: WashLabelPrintData = {
    width: wash.w,
    height: wash.h,
    compositionText,
    washInstructionsText,
    careIconCodes: careCodes,
    manufacturingText,
    dateText,
  };
  if (count <= 1) return buildWashLabelPrintHtml(printData);
  return buildWashLabelMultiPageHtml(Array.from({ length: count }, () => printData));
};
