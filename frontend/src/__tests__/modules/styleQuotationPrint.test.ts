import { describe, expect, it } from 'vitest';
import { buildQuotationPrintHtml } from '@/modules/basic/pages/StyleInfo/components/styleQuotation/buildQuotationPrintHtml';

/**
 * 报价单打印 HTML 构建的回归测试。
 *
 * 核心守护一件事：**工序同时带 progressStage 和 processName 时，打印不能抛错**。
 *
 * 事故背景（2026-10-20 线上报障）：
 * 顾客点「样衣开发详情 → 报价单 → 打印」，控制台抛
 *   Uncaught ReferenceError: Cannot access 'y' before initialization
 *   at StyleSecondaryProcessTab--j2DNZ2p.js:18:120
 * 整张报价单白屏。
 *
 * 根因不是"某个变量写错"，而是 **TDZ（暂时性死区）**：
 * `processRows` 的 `.map()` 是立即执行的，回调里用 `FS_SMALL - 1`
 * 渲染「工序名 (阶段)」，而 `FS_SMALL` 的声明在 map **之后**。
 * 于是回调一执行就抛 ReferenceError，整张单子出不来。
 *
 * 为什么潜伏了 40 天：只有在"某道工序同时有 progressStage 和 processName"
 * 时才会走进那个模板字符串；两者缺任一都走 else 分支，不报错。
 * TypeScript 也不报（闭包里引用后声明的 const 是合法模式），
 * 所以 2026-09-10 引入后一直没被发现，直到某款的数据同时满足两个字段。
 */
describe('buildQuotationPrintHtml - 报价单打印', () => {
  const baseParams = {
    bomList: [],
    processList: [],
    secondaryProcessList: [],
    materialCost: 0,
    processCost: 0,
    otherCost: 0,
    totalCost: 0,
    totalPrice: 0,
    profit: 0,
    actualProfitRate: '0',
  };

  it('工序同时有 progressStage 和 processName 时不得抛 TDZ（线上事故回归）', () => {
    expect(() =>
      buildQuotationPrintHtml({
        ...baseParams,
        styleNo: 'TEST-001',
        processList: [
          { processName: '车缝', progressStage: '裁剪', price: 10, rateMultiplier: 1 },
          { processName: '整烫', progressStage: '后整', price: 5, rateMultiplier: 1.5 },
        ],
      }),
    ).not.toThrow();
  });

  it('阶段说明要真渲染出来（字号比正文小一号），不能因为躲错误而阉掉功能', () => {
    const html = buildQuotationPrintHtml({
      ...baseParams,
      styleNo: 'TEST-001',
      processList: [{ processName: '车缝', progressStage: '裁剪', price: 10, rateMultiplier: 1 }],
    });
    expect(html).toContain('车缝');
    expect(html).toContain('(裁剪)');
    // FS_SMALL - 1：dense=0 时 FS_SMALL=11，故为 10px
    expect(html).toContain('font-size:10px');
    expect(html).toContain('color:#888');
  });

  it('只有 progressStage 没有 processName 时不做阶段标注（原分支行为不变）', () => {
    const html = buildQuotationPrintHtml({
      ...baseParams,
      processList: [{ processName: '', progressStage: '裁剪', price: 1 }],
    });
    expect(html).not.toContain('(裁剪)');
  });

  it('版面自适应四档都要能出图（dense 0~3 都不能踩 TDZ）', () => {
    for (const n of [1, 8, 15, 30]) {
      const html = buildQuotationPrintHtml({
        ...baseParams,
        processList: Array.from({ length: n }, (_, i) => ({
          processName: `工序${i}`,
          progressStage: `阶段${i}`,
          price: 1,
        })),
      });
      expect(html).toContain('报 价 单');
    }
  });

  it('三段内容都有时也能正常构建', () => {
    const html = buildQuotationPrintHtml({
      bomList: [
        {
          styleId: 'S1', materialType: 'fabric', materialCode: 'M1', materialName: '棉布',
          color: '', size: '', supplier: '', unit: '米', usageAmount: 2, lossRate: 5, unitPrice: 20,
        },
      ],
      processList: [{ processName: '车缝', progressStage: '裁剪', price: 10 }],
      secondaryProcessList: [{ processName: '绣花', unitPrice: 3 }],
      materialCost: 42,
      processCost: 10,
      otherCost: 0,
      totalCost: 55,
      totalPrice: 80,
      profit: 25,
      actualProfitRate: '31.25',
      printedBy: '张三',
    });
    expect(html).toContain('一、物料明细');
    expect(html).toContain('二、工序明细');
    expect(html).toContain('三、二次工艺');
    expect(html).toContain('四、成本核算汇总');
    expect(html).toContain('张三');
  });
});
