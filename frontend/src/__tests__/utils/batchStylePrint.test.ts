/**
 * D-611 批量打印测试：合并模板 / 二维码内容 / 行映射 / 批量执行容错
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { buildBatchPrintHtml, type BatchPrintDocInput } from '../../components/common/StylePrintModal/batchPrintTemplate';
import { buildQrValue } from '../../components/common/StylePrintModal/fetchStylePrintData';
import {
  mapProductionOrdersToBatchItems,
  mapStyleRowsToBatchItems,
  runBatchStylePrint,
} from '../../components/common/StylePrintModal/batchStylePrintService';
import { safePrint } from '../../utils/safePrint';

// ───── buildBatchPrintHtml ─────

const doc = (styleNo: string, body: string): BatchPrintDocInput => ({
  styleNo,
  pageTitle: '大货生产单',
  bodyHtml: body,
  printerInfo: '打印人: 张三 (zs)',
  printDate: '2026-09-28 10:00:00',
});

describe('buildBatchPrintHtml', () => {
  it('两单合并：各自带大标题与页脚，单与单之间插一个分页符', () => {
    const html = buildBatchPrintHtml({
      docs: [doc('HH001', '<div>body-1</div>'), doc('HH002', '<div>body-2</div>')],
      tenantName: '东方制衣厂',
    });
    expect(html).toContain('<title>批量打印 - 2 单</title>');
    expect(html).toContain('东方制衣厂 - 大货生产单');
    expect((html.match(/东方制衣厂 - 大货生产单/g) || []).length).toBe(2);
    expect((html.match(/page-break-after:always/g) || []).length).toBe(1);
    expect(html).toContain('body-1');
    expect(html).toContain('body-2');
    // 每单各带一个打印人页脚
    expect((html.match(/打印人: 张三 \(zs\)/g) || []).length).toBe(2);
  });

  it('头部样式包含基础模板与内容区两套 CSS（与单一打印同源）', () => {
    const html = buildBatchPrintHtml({ docs: [doc('HH001', 'x')] });
    expect(html).toContain('--color-bg-base');
    expect(html).toContain('.print-sec');
    expect(html).toContain('@page');
  });

  it('fontScale 缩放：内联字号与共享 CSS 固定 px 同步放大', () => {
    const html = buildBatchPrintHtml({
      docs: [doc('HH001', '<span style="font-size:16px">a</span>')],
      fontScale: 1.2,
    });
    expect(html).toContain('font-size:19.2px');
    expect(html).toContain('font-size:15.6px'); // 13 * 1.2（.pt 基准）
  });

  it('printerInfo 含 HTML 时被转义', () => {
    const html = buildBatchPrintHtml({
      docs: [{ ...doc('HH001', 'x'), printerInfo: '<script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ───── buildQrValue ─────

describe('buildQrValue', () => {
  it('样衣模式有 patternId → pattern 码', () => {
    expect(buildQrValue('sample', { patternId: '9' })).toBe('{"type":"pattern","id":"9"}');
  });

  it('样衣模式无 patternId → style 信息码', () => {
    expect(buildQrValue('sample', { styleNo: 'HH001', styleName: '连衣裙' }))
      .toBe('{"type":"style","styleNo":"HH001","styleName":"连衣裙","orderNo":""}');
  });

  it('大货模式 → order 信息码', () => {
    expect(buildQrValue('production', { styleNo: 'HH001', orderId: '5', orderNo: 'PO1' }))
      .toBe('{"type":"order","styleNo":"HH001","orderId":"5","orderNo":"PO1"}');
  });
});

// ───── 行映射 ─────

describe('mapProductionOrdersToBatchItems', () => {
  it('大货订单行 → production 条目，extraInfo 与单一打印同口径', () => {
    const items = mapProductionOrdersToBatchItems([
      {
        id: 88, styleId: '12', styleNo: 'HH001', styleName: '连衣裙',
        styleCover: 'http://x/1.jpg', color: '黑色', orderQuantity: 300,
        category: '连衣裙', orderNo: 'PO20260928001',
        factoryName: '东方制衣厂', merchandiser: '李四', plannedEndDate: '2026-10-20',
        orderDetails: [{ color: '黑色', size: 'M', quantity: 150 }],
      },
      null,
      { id: 89, styleNo: '' }, // 无 styleId/styleNo → 过滤
    ] as any);
    expect(items.length).toBe(1);
    const it0 = items[0];
    expect(it0.mode).toBe('production');
    expect(it0.styleId).toBe('12');
    expect(it0.orderId).toBe('88');
    expect(it0.orderNo).toBe('PO20260928001');
    expect(it0.extraInfo).toMatchObject({ '订单号': 'PO20260928001', '订单数量': 300, '加工厂': '东方制衣厂', '跟单员': '李四' });
    expect(Array.isArray(it0.sizeDetails)).toBe(true);
    expect(it0.sizeDetails?.length).toBe(1);
  });
});

describe('mapStyleRowsToBatchItems', () => {
  it('样衣行 → sample 条目，结构字段透传', () => {
    const items = mapStyleRowsToBatchItems([
      { id: 7, styleNo: 'HH002', styleName: '外套', cover: 'http://x/2.jpg', category: '外套', season: 'SPRING', color: '米白' },
    ] as any);
    expect(items.length).toBe(1);
    const it0 = items[0];
    expect(it0.mode).toBe('sample');
    expect(it0.styleId).toBe(7);
    expect(it0.styleNo).toBe('HH002');
    expect(it0.cover).toBe('http://x/2.jpg');
    expect(it0.category).toBe('外套');
    expect(it0.season).toBe('SPRING');
    expect(typeof it0.color).toBe('string');
  });
});

// ───── runBatchStylePrint 容错 ─────

vi.mock('../../components/common/StylePrintModal/fetchStylePrintData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/common/StylePrintModal/fetchStylePrintData')>();
  return {
    ...actual,
    fetchStylePrintData: vi.fn(),
  };
});

vi.mock('../../utils/safePrint', () => ({
  safePrint: vi.fn((_html: string, _title: string, opts?: { onAfterPrint?: () => void }) => {
    opts?.onAfterPrint?.();
    return true;
  }),
}));

import { fetchStylePrintData } from '../../components/common/StylePrintModal/fetchStylePrintData';
import { DEFAULT_PRINT_OPTIONS } from '../../components/common/StylePrintModal/types';
import { prepareBatchDocs, runBatchStylePrintSequential } from '../../components/common/StylePrintModal/batchStylePrintService';

const mockedFetch = fetchStylePrintData as unknown as ReturnType<typeof vi.fn>;
const mockedSafePrint = safePrint as unknown as ReturnType<typeof vi.fn>;

describe('runBatchStylePrint', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSafePrint.mockClear();
  });

  it('单款失败只跳过：其余单据照常合并打印', async () => {
    mockedFetch.mockImplementation(async ({ styleNo }: any) => {
      if (styleNo === 'BAD') throw new Error('boom');
      return {
        data: { sizes: [], bom: [], process: [], attachments: [], productionSheet: null },
        resolvedCover: null,
        orderCreatorName: '',
        patternId: null,
        patternRecords: [],
        qrValue: '{}',
      };
    });

    const result = await runBatchStylePrint({
      items: [
        { key: 1, mode: 'production', styleNo: 'OK1' },
        { key: 2, mode: 'production', styleNo: 'BAD' },
        { key: 3, mode: 'production', styleNo: 'OK2' },
      ],
      options: DEFAULT_PRINT_OPTIONS,
      fontScale: 1,
      tenantName: '东方制衣厂',
      user: {},
      printerInfo: '打印人: 测试',
    });

    expect(result.total).toBe(3);
    expect(result.okCount).toBe(2);
    expect(result.failed).toEqual(['BAD']);
    expect(mockedSafePrint).toHaveBeenCalledTimes(1);
    const [html, , opts] = mockedSafePrint.mock.calls[0];
    expect(String(html)).toContain('OK1');
    expect(String(html)).toContain('OK2');
    // 批量文档图片等待预算放宽到 6s
    expect((opts as any)?.imageWaitMs).toBe(6000);
  });

  it('全部失败时不调用打印', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'));
    const result = await runBatchStylePrint({
      items: [{ key: 1, mode: 'sample', styleNo: 'A' }, { key: 2, mode: 'sample', styleNo: 'B' }],
      options: DEFAULT_PRINT_OPTIONS,
      fontScale: 1,
      user: {},
      printerInfo: '打印人: 测试',
    });
    expect(result.okCount).toBe(0);
    expect(result.failed).toEqual(['A', 'B']);
    expect(mockedSafePrint).not.toHaveBeenCalled();
  });
});

// ───── 逐单连打（D-611b）─────

describe('runBatchStylePrintSequential', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSafePrint.mockClear();
  });

  const stubBundle = () => ({
    data: { sizes: [], bom: [], process: [], attachments: [], productionSheet: null },
    resolvedCover: null,
    orderCreatorName: '',
    patternId: null,
    patternRecords: [],
    qrValue: '{}',
  });

  it('每单独立打印任务：各调用一次 safePrint，互不混排', async () => {
    mockedFetch.mockResolvedValue(stubBundle());
    const { docs } = await prepareBatchDocs({
      items: [
        { key: 1, mode: 'production', styleNo: 'HH001' },
        { key: 2, mode: 'production', styleNo: 'HH002' },
      ],
      options: DEFAULT_PRINT_OPTIONS,
      user: {},
      printerInfo: '打印人: 测试',
    });
    expect(docs.length).toBe(2);

    const started: string[] = [];
    const { printedCount } = await runBatchStylePrintSequential({
      docs, fontScale: 1, tenantName: '东方制衣厂',
      onDocStart: (_i, _t, styleNo) => started.push(styleNo),
    });

    expect(printedCount).toBe(2);
    expect(started).toEqual(['HH001', 'HH002']);
    expect(mockedSafePrint).toHaveBeenCalledTimes(2);
    const [html1] = mockedSafePrint.mock.calls[0];
    const [html2] = mockedSafePrint.mock.calls[1];
    expect(String(html1)).toContain('HH001');
    expect(String(html1)).not.toContain('HH002');
    expect(String(html2)).toContain('HH002');
    expect(String(html2)).not.toContain('HH001');
    // 逐单路径走单一打印模板（每单页脚=本单 第X页/共Y页 由 D-520 机制保证）
    expect(String(html1)).toContain('打印人: 测试');
  });

  it('中断后不再送出后续单据', async () => {
    mockedFetch.mockResolvedValue(stubBundle());
    const { docs } = await prepareBatchDocs({
      items: [
        { key: 1, mode: 'sample', styleNo: 'A' },
        { key: 2, mode: 'sample', styleNo: 'B' },
        { key: 3, mode: 'sample', styleNo: 'C' },
      ],
      options: DEFAULT_PRINT_OPTIONS,
      user: {},
      printerInfo: '打印人: 测试',
    });
    let printed = 0;
    const { printedCount } = await runBatchStylePrintSequential({
      docs, fontScale: 1,
      isAborted: () => printed >= 1,
      onDocStart: () => { printed += 1; },
    });
    expect(printedCount).toBe(1);
    expect(mockedSafePrint).toHaveBeenCalledTimes(1);
  });
});
