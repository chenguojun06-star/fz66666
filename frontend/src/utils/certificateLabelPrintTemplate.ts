/**
 * D-221：合格证标签打印模板（大货 打印标签 第三个页签）
 * - 版式：标题"合格证" + 左列标签文字/右列值 + 底部 CODE128 条码（可扫码）
 * - 所有左右两列文字均可编辑；每行勾选控制打印，不勾选整行不出现（与洗水唛同一哲学）
 * - 条码码值支持占位符：{款号} {颜色} {码数} {序号}，逐页替换；非 ASCII 字符剔除保证 CODE128 可编码
 */
import JsBarcode from 'jsbarcode';

export interface CertRowState {
  key: string;
  show: boolean;
  labelText: string;
  valueText: string;
}

export interface CertificateSectionState {
  titleText: string;
  rows: CertRowState[];
  showBarcode: boolean;
  /** 条码码值模板，如 "{款号}{颜色}{码数}"，支持占位符 {款号}{颜色}{码数}{序号} */
  barcodeTemplate: string;
  /** D-223：条码下方显示商品编码（每页自动带该 SKU 的商品编码） */
  showBarcodeText: boolean;
  fontScale: number;
}

export interface CertificatePageData {
  color: string;
  size: string;
  seq: number;
  sku?: string;
}

export const CERT_BARCODE_PLACEHOLDERS = ['{款号}', '{颜色}', '{码数}', '{序号}'] as const;

/** 企业名称/地址/执行标准这类跨款固定项：localStorage 记忆（key: certificate-print-settings） */
const CERT_SETTINGS_KEY = 'certificate-print-settings';

export function loadCertPersistedSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CERT_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCertPersistedSettings(rows: CertRowState[]): void {
  try {
    const persisted = loadCertPersistedSettings();
    rows.forEach((r) => { persisted[r.key] = r.valueText; });
    localStorage.setItem(CERT_SETTINGS_KEY, JSON.stringify(persisted));
  } catch { /* ignore */ }
}

/** CODE128 条码 SVG（内联进打印 HTML）；非 ASCII 剔除保证可编码可扫 */
export function generateCertBarcodeSvg(value: string, height = 52): string {
  const ascii = value.replace(/[^\x20-\x7E]/g, '').trim();
  if (!ascii) return '';
  try {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgEl, ascii, {
      format: 'CODE128', width: 1.4, height, displayValue: true,
      fontSize: 11, margin: 0, background: 'transparent',
    });
    return svgEl.outerHTML;
  } catch {
    return '';
  }
}

const escapeHtml = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 逐页替换条码占位符 */
export function resolveBarcodeValue(
  template: string,
  ctx: { styleNo: string; color: string; size: string; seq: number },
): string {
  return template
    .replace(/\{款号\}/g, ctx.styleNo || '')
    .replace(/\{颜色\}/g, ctx.color || '')
    .replace(/\{码数\}/g, ctx.size || '')
    .replace(/\{序号\}/g, String(ctx.seq));
}

function buildLabelHtml(
  w: number,
  h: number,
  cfg: CertificateSectionState,
  page: CertificatePageData | null,
  barcodeSvg: string,
): string {
  const rowHtml = cfg.rows
    .filter((r) => r.show && (String(r.labelText).trim() || String(r.valueText).trim()))
    .map((r) => {
      let value = String(r.valueText ?? '');
      if (page) {
        value = value
          .replace(/\{颜色\}/g, page.color || '')
          .replace(/\{码数\}/g, page.size || '')
          .replace(/\{序号\}/g, String(page.seq));
        // D-223：规格/颜色留空时自动带该页 SKU 的码数/颜色（与洗水唛码数区同一回落逻辑）
        if (!value.trim()) {
          if (r.key === 'guige') value = page.size || '';
          else if (r.key === 'yanse') value = page.color || '';
        }
      }
      const label = String(r.labelText ?? '');
      // 中文标签两字/三字补全角空格对齐（品 名 / 款 号），四字以上不补（\u3000 转义避免 no-irregular-whitespace）
      const IGAP = '\u3000';
      const padLabel = label.length === 2 ? `${label.charAt(0)}${IGAP}${label.charAt(1)}`
        : label.length === 3 ? `${label.charAt(0)}${IGAP}${label.slice(1)}` : label;
      return `<div class="cert-row">
        <span class="cert-lbl">${escapeHtml(padLabel)}${label.length > 0 && label.length < 4 ? '：' : ''}</span>
        <span class="cert-val">${escapeHtml(value)}</span>
      </div>`;
    })
    .join('\n');

  return `<div class="page">
    <div class="cert">
      ${cfg.titleText ? `<div class="cert-title">${escapeHtml(cfg.titleText)}</div>` : ''}
      <div class="cert-rows">${rowHtml}</div>
      ${cfg.showBarcode && barcodeSvg ? `<div class="cert-barcode">${barcodeSvg}</div>` : ''}
      ${cfg.showBarcode && cfg.showBarcodeText && page?.sku ? `<div class="cert-sku">${escapeHtml(page.sku)}</div>` : ''}
    </div>
  </div>`;
}

/** 单页预览 HTML（配置面板 iframe 用，取第一个 SKU 行做示例） */
export function buildCertificatePreviewHtml(
  w: number,
  h: number,
  cfg: CertificateSectionState,
  sample: { styleNo: string; color: string; size: string; seq: number },
): string {
  const svg = cfg.showBarcode
    ? generateCertBarcodeSvg(resolveBarcodeValue(cfg.barcodeTemplate, sample))
    : '';
  const sku = `${sample.styleNo}${sample.color}${sample.size}`;
  return wrapDocument(w, h, cfg, buildLabelHtml(w, h, cfg, { ...sample, sku }, svg));
}

/** 多页打印 HTML：每个选中 SKU × 打印数量 一页 */
export function buildCertificateMultiPageHtml(
  w: number,
  h: number,
  cfg: CertificateSectionState,
  styleNo: string,
  pages: CertificatePageData[],
): string {
  const body = pages.map((p, i) => {
    const svg = cfg.showBarcode
      ? generateCertBarcodeSvg(resolveBarcodeValue(cfg.barcodeTemplate, {
        styleNo,
        color: p.color,
        size: p.size,
        seq: p.seq,
      }))
      : '';
    return buildLabelHtml(w, h, cfg, { ...p, seq: i + 1, sku: p.sku || `${styleNo}${p.color}${p.size}` }, svg);
  }).join('\n');
  return wrapDocument(w, h, cfg, body);
}

function wrapDocument(w: number, h: number, cfg: CertificateSectionState, body: string): string {
  const fs = (11 * (cfg.fontScale || 1)).toFixed(1);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; background: #fff; -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; height: ${h}mm; display: flex; align-items: stretch; justify-content: center; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.cert { width: calc(${w}mm - 4mm); margin: 2mm; display: flex; flex-direction: column; padding: 2mm 1mm; }
.cert-title { text-align: center; font-size: ${(Number(fs) + 6).toFixed(1)}pt; font-weight: 700; letter-spacing: 2mm; margin-bottom: 2mm; }
.cert-rows { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 1.1mm; }
.cert-row { display: flex; align-items: baseline; font-size: ${fs}pt; line-height: 1.45; }
.cert-lbl { color: #000; white-space: nowrap; }
.cert-val { font-weight: 600; margin-left: 0.5mm; word-break: break-all; }
.cert-barcode { margin-top: 1.5mm; display: flex; justify-content: center; }
.cert-barcode svg { max-width: 100%; height: auto; }
.cert-sku { text-align: center; font-size: ${(Number(fs) - 1).toFixed(1)}pt; letter-spacing: 0.2mm; margin-top: 0.5mm; }
</style></head><body>${body}</body></html>`;
}
