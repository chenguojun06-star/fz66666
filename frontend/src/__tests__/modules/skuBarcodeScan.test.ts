import { describe, expect, it, vi } from 'vitest';

/**
 * jsdom 没有 canvas，JsBarcode 真跑会静默失败（getContext 未实现）。
 * mock 成把码值写进 SVG —— 断言反而更直接：条码元素上带的码就是要入码的值。
 */
vi.mock('jsbarcode', () => ({
  default: (el: { setAttribute: (k: string, v: string) => void }, value: string) => {
    el.setAttribute('data-code', value);
  },
}));

import {
  resolveBarcodeValue,
  CERT_BARCODE_PLACEHOLDERS,
  buildCertificateMultiPageHtml,
  generateCertBarcodeSvg,
} from '@/utils/certificateLabelPrintTemplate';

/**
 * 合格证条码（D-836 扫码通）回归：
 * CODE128 一维条码只能编 ASCII；skuCode 含中文颜色 → 老模板解析出中文时
 * 必须自动回落机读码（barcode），否则条码丢颜色、收银台/仓库扫码 LIKE 失配。
 */

const BAR = 'SKU000396';

describe('resolveBarcodeValue —— CODE128 码值解析', () => {
  it('老模板 {款号}{颜色}{码数} 解析出中文 → 自动回落机读码（老标签零改动也能扫）', () => {
    const v = resolveBarcodeValue('{款号}{颜色}{码数}', {
      styleNo: 'BO24XS0310A',
      color: '粉色',
      size: 'XS(155/80A)',
      seq: 1,
      barcode: BAR,
    });
    expect(v).toBe(BAR);
  });

  it('新模板 {机读码} 直接打机读码', () => {
    const v = resolveBarcodeValue('{机读码}', {
      styleNo: 'BO24XS0310A', color: '粉色', size: 'S', seq: 1, barcode: BAR,
    });
    expect(v).toBe(BAR);
  });

  it('纯 ASCII 模板不受回落影响（尊重商家自定义，如 {款号}-{序号}）', () => {
    const v = resolveBarcodeValue('{款号}-{序号}', {
      styleNo: 'BO24XS0310A', color: '粉色', size: 'S', seq: 2, barcode: BAR,
    });
    expect(v).toBe('BO24XS0310A-2');
  });

  it('没有机读码可回落时保持原值（打印降级不阻断）', () => {
    const v = resolveBarcodeValue('{款号}{颜色}', {
      styleNo: 'BO24XS0310A', color: '粉色', size: 'S', seq: 1,
    });
    expect(v).toBe('BO24XS0310A粉色');
  });

  it('机读码本身必须是纯 ASCII（CODE128 可编码），且 {机读码} 在占位符清单里', () => {
    expect(BAR).toMatch(/^[\x20-\x7E]+$/);
    expect(CERT_BARCODE_PLACEHOLDERS).toContain('{机读码}');
  });
});

describe('buildCertificateMultiPageHtml —— 多页打印带机读码', () => {
  const cfg = {
    titleText: '合格证',
    rows: [{ key: 'kuanhao', show: true, labelText: '款号', valueText: 'BO24XS0310A' }],
    showBarcode: true,
    showBarcodeText: true,
    barcodeTemplate: '{机读码}',
    fontScale: 1,
  } as any;

  it('每页条码值来自该页 SKU 的机读码（不同 SKU 不同码）', () => {
    const html = buildCertificateMultiPageHtml(40, 70, cfg, 'BO24XS0310A', [
      { color: '粉色', size: 'S', seq: 1, barcode: 'SKU000001', sku: 'BO24XS0310A粉色S' },
      { color: '象牙白', size: 'M', seq: 2, barcode: 'SKU000002', sku: 'BO24XS0310A象牙白M' },
    ]);
    expect(html).toContain('data-code="SKU000001"');
    expect(html).toContain('data-code="SKU000002"');
    // 条码 SVG 内嵌（JsBarcode 生成），人读文字行仍是完整商品编码
    expect(html).toContain('BO24XS0310A粉色S');
  });

  it('缺机读码的页不渲染条码 SVG，但标签本身照常出（老行为不阻断）', () => {
    const html = buildCertificateMultiPageHtml(40, 70, cfg, 'BO24XS0310A', [
      { color: '粉色', size: 'S', seq: 1, sku: 'BO24XS0310A粉色S' },
    ]);
    expect(html).not.toContain('<svg');
    expect(html).toContain('BO24XS0310A粉色S');
  });
});

describe('generateCertBarcodeSvg —— 码值净化', () => {
  it('码值含中文时剔除后再入码（与 resolveBarcodeValue 回落配合，双保险）', () => {
    const svg = generateCertBarcodeSvg('SKU000396'); // 纯 ASCII 正常路径
    expect(svg).toContain('data-code="SKU000396"');
    const fake = generateCertBarcodeSvg('中文123');
    // 非 ASCII 被剔后剩 '123'，仍可入码（不会抛错/返空）
    expect(fake).toContain('data-code="123"');
  });
});
