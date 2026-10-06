import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 批量打印单据顺序稳定性回归守护（D-702）
 *
 * <p><b>发现途径</b>：CI 上 {@code batchStylePrint.test.ts} 的顺序断言
 * {@code expected ['HH002','HH001'] to deeply equal ['HH001','HH002']} 偶发失败。
 * 本地跑 3 次都通过 —— 因为 mock 立即 resolve，顺序恰好稳定。
 *
 * <p><b>但它不是 flaky 测试，而是暴露了真实缺陷</b>：
 * {@code prepareBatchDocs} 原本在 {@code runOne} 内直接 {@code docs.push(...)}，
 * 而 {@code runOne} 通过 {@code Promise.all} <b>并发</b>执行（并发度 3）——
 * 于是 docs 的顺序取决于<b>各单据网络请求的返回先后</b>，而不是用户勾选的顺序。
 *
 * <p><b>真实用户影响</b>：D-611b 的「批量打印页码按单独立」与用户选择错位 ——
 * 勾选 A/B/C 却可能打成 B/A/C，页码与款式对不上。
 * 本地 mock 立即返回掩盖了它，网络一抖动就暴露。
 *
 * <p>修法：{@code runOne} 返回结果、由原始下标归位，保证 docs 与 items 严格同序。
 */
vi.mock('../../components/common/StylePrintModal/fetchStylePrintData', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    default: vi.fn(),
    fetchStylePrintData: vi.fn(),
  };
});
vi.mock('../../utils/safePrint', () => ({
  safePrint: vi.fn().mockResolvedValue(undefined),
  buildPrintHtml: vi.fn().mockReturnValue('<html></html>'),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,xx') },
}));

import { fetchStylePrintData } from '../../components/common/StylePrintModal/fetchStylePrintData';
import { prepareBatchDocs } from '../../components/common/StylePrintModal/batchStylePrintService';
import { DEFAULT_PRINT_OPTIONS } from '../../components/common/StylePrintModal/types';

const mockedFetch = fetchStylePrintData as unknown as ReturnType<typeof vi.fn>;

const stubBundle = () => ({
  data: { sizes: [], bom: [], process: [], attachments: [], productionSheet: null },
  resolvedCover: null,
  orderCreatorName: '',
  patternId: null,
  patternRecords: [],
  qrValue: '{}',
});

describe('D-702 批量打印顺序稳定性（docs 必须与勾选顺序一致）', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('即使后一个单据先返回，docs 顺序也必须与 items 原顺序一致', async () => {
    // 关键：第二个单据延迟更久 → 若实现依赖「返回先后」，顺序就会错乱
    mockedFetch.mockImplementation(async ({ styleNo }: { styleNo?: string }) => {
      if (styleNo === 'HH002') {
        await new Promise((r) => setTimeout(r, 30));
      }
      return stubBundle();
    });

    const items = [
      { key: 1, mode: 'production' as const, styleNo: 'HH001' },
      { key: 2, mode: 'production' as const, styleNo: 'HH002' },
      { key: 3, mode: 'production' as const, styleNo: 'HH003' },
    ];

    const { docs } = await prepareBatchDocs({
      items,
      options: DEFAULT_PRINT_OPTIONS,
      user: {},
      printerInfo: '打印人: 测试',
    });

    // docs 顺序必须等于勾选顺序，不能受网络返回先后影响
    expect(docs.map((d) => d.styleNo)).toEqual(['HH001', 'HH002', 'HH003']);
  });

  it('某单据失败时，其余单据顺序仍保持不变', async () => {
    mockedFetch.mockImplementation(async ({ styleNo }: { styleNo?: string }) => {
      if (styleNo === 'HH002') throw new Error('boom');
      return stubBundle();
    });

    const items = [
      { key: 1, mode: 'production' as const, styleNo: 'HH001' },
      { key: 2, mode: 'production' as const, styleNo: 'HH002' },
      { key: 3, mode: 'production' as const, styleNo: 'HH003' },
    ];

    const { docs, failed } = await prepareBatchDocs({
      items,
      options: DEFAULT_PRINT_OPTIONS,
      user: {},
      printerInfo: '打印人: 测试',
    });

    expect(failed).toEqual(['HH002']);
    // 失败项被剔除后，其余项顺序必须保持
    expect(docs.map((d) => d.styleNo)).toEqual(['HH001', 'HH003']);
  });
});