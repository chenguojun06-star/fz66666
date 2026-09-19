import { describe, it, expect, vi } from 'vitest';
import {
  buildWashLabelPrintHtml,
  buildWashLabelMultiPageHtml,
  compositionFromSections,
  washTextFromInstructions,
} from '../../utils/washLabelPrintTemplate';

/** 从生成的 CSS 里取出正文行字号（.size-line{font-size:Npt}） */
const fontSizeOf = (html: string): number => {
  const m = html.match(/\.size-line\{font-size:([\d.]+)pt/);
  return m ? Number(m[1]) : Number.NaN;
};

// 模拟 careIcons
vi.mock('../../utils/careIcons', () => ({
  CARE_ICONS: {
    wash30: { category: 'wash', svg: '<svg>wash30</svg>' },
    iron1: { category: 'iron', svg: '<svg>iron1</svg>' },
    bleach1: { category: 'bleach', svg: '<svg>bleach1</svg>' },
  },
}));

describe('washLabelPrintTemplate', () => {
  const mockData = {
    width: 50,
    height: 40,
    compositionText: '100%棉',
    washInstructionsText: '30℃水洗',
    careIconCodes: ['wash30', 'iron1'],
    manufacturingText: '中国制造',
    dateText: '20260525',
  };

  describe('buildWashLabelPrintHtml', () => {
    it('生成完整HTML', () => {
      const html = buildWashLabelPrintHtml(mockData);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('100%棉');
      expect(html).toContain('30℃水洗');
      expect(html).toContain('中国制造');
      expect(html).toContain('20260525');
    });

    it('只显示用户输入的内容：空分区不渲染、无默认文案、无分隔虚线', () => {
      const html = buildWashLabelPrintHtml({
        ...mockData,
        sizeText: '',
        styleNo: '',
        manufacturingText: '',
        dateText: '',
      });
      // 空制造区不渲染 MADE IN CHINA 之类兜底文案
      expect(html).not.toContain('MADE IN CHINA');
      // 无自动日期兜底
      expect(html).not.toMatch(/20\d{6}/);
      // 不添加分隔虚线等额外元素
      expect(html).not.toContain('dash-sep');
    });

    it('全部分区标准字体无加粗', () => {
      const html = buildWashLabelPrintHtml(mockData);
      expect(html).not.toMatch(/font-weight:\s*(600|700|800|bold)/);
    });

    it('距剪口偏移：topOffsetMm 作为顶部留白', () => {
      const html = buildWashLabelPrintHtml({ ...mockData, topOffsetMm: 30 });
      expect(html).toContain('padding:30mm');
    });

    it('字号随标签宽度自适应：越宽字号越大，且不超过上限 13pt', () => {
      // 说明：实现在 705abf3fc 改为「先按宽度算理想字号，放不下再逐步收缩」，
      // 所以具体数值取决于内容高度，这里只校验单调性与上限，不锁死具体 pt 值。
      const fs30 = fontSizeOf(buildWashLabelPrintHtml({ ...mockData, width: 30 }));
      const fs50 = fontSizeOf(buildWashLabelPrintHtml({ ...mockData, width: 50 }));
      const fs80 = fontSizeOf(buildWashLabelPrintHtml({ ...mockData, width: 80 }));
      expect(Number.isFinite(fs30)).toBe(true);
      expect(fs50).toBeGreaterThan(fs30);
      expect(fs80).toBeGreaterThanOrEqual(fs50);
      expect(fs80).toBeLessThanOrEqual(13);
    });

    it('图标大小随标签宽度自适应且强制一排不换行（防截断）', () => {
      // 同上：图标尺寸由 calcIconRowHeight 按宽度算出，容器固定 nowrap 防截断
      const html = buildWashLabelPrintHtml({ ...mockData, width: 30 });
      expect(html).toMatch(/\.icon-cell\{width:[\d.]+mm/);
      expect(html).toMatch(/flex-wrap:nowrap/);
    });
  });

  describe('buildWashLabelMultiPageHtml', () => {
    it('单页调用单页函数', () => {
      const html = buildWashLabelMultiPageHtml([mockData]);
      expect(html).toEqual(buildWashLabelPrintHtml(mockData));
    });

    it('多页生成多个标签页', () => {
      const html = buildWashLabelMultiPageHtml([mockData, mockData]);
      expect(html).toContain('label-page');
      const count = (html.match(/class="label-page"/g) || []).length;
      expect(count).toBe(2);
    });

    it('空数组返回空字符串', () => {
      expect(buildWashLabelMultiPageHtml([])).toBe('');
    });
  });

  describe('compositionFromSections', () => {
    it('优先使用fabricCompositionParts', () => {
      const parts = JSON.stringify([
        { part: '面料', materials: '100%棉' },
        { part: '里料', materials: '100%聚酯纤维' },
      ]);
      expect(compositionFromSections(parts, '备用成分')).toBe('面料：100%棉\n里料：100%聚酯纤维');
    });

    it('无parts时使用fabricComposition', () => {
      expect(compositionFromSections(undefined, '100%棉')).toBe('100%棉');
    });

    it('无效JSON回退到fabricComposition', () => {
      expect(compositionFromSections('invalid-json', '100%棉')).toBe('100%棉');
    });

    it('空值返回空字符串', () => {
      expect(compositionFromSections(undefined, undefined)).toBe('');
      expect(compositionFromSections('', '')).toBe('');
    });

    it('过滤无效项目', () => {
      const parts = JSON.stringify([
        { part: '面料', materials: '' },
        { part: '里料', materials: '100%聚酯纤维' },
      ]);
      expect(compositionFromSections(parts, '')).toBe('里料：100%聚酯纤维');
    });
  });

  describe('washTextFromInstructions', () => {
    it('使用washInstructions', () => {
      expect(washTextFromInstructions('30℃水洗')).toBe('30℃水洗');
    });

    it('从fabricCompositionParts中获取洗涤说明', () => {
      const parts = JSON.stringify([
        { materials: '', washNote: '不可漂白' },
      ]);
      expect(washTextFromInstructions(undefined, parts)).toBe('不可漂白');
    });

    it('移除洗涤说明前缀', () => {
      expect(washTextFromInstructions('洗涤说明（水洗标专用）30℃水洗')).toBe('30℃水洗');
      expect(washTextFromInstructions('洗涤说明(水洗标专用)30℃水洗')).toBe('30℃水洗');
    });

    it('空值返回空字符串', () => {
      expect(washTextFromInstructions(undefined, undefined)).toBe('');
      expect(washTextFromInstructions('', '')).toBe('');
    });
  });
});
