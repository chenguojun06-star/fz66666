/**
 * spreadsheetPaste 数字清洗
 *
 * 这组用例锁的是**最容易被后来人改错**的地方：Excel 粘进来的是「显示格式」不是数值。
 * 清洗失败若退回 0，会把售价写成 0 元、库存写成 0 件 —— 比不支持粘贴危害大得多。
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeNumericCell, parseSpreadsheetText, applySpreadsheetRows,
} from '@/modules/ecommerce/pages/ShopListing/spreadsheetPaste';

describe('sanitizeNumericCell 单元格数字清洗', () => {
  it('纯数字', () => {
    expect(sanitizeNumericCell('60')).toBe(60);
    expect(sanitizeNumericCell('1234.5')).toBe(1234.5);
    expect(sanitizeNumericCell('-3')).toBe(-3);
  });

  it('带货币符号', () => {
    expect(sanitizeNumericCell('¥1,234.50')).toBe(1234.5);
    expect(sanitizeNumericCell('$99')).toBe(99);
    expect(sanitizeNumericCell('￥2688元')).toBe(2688);
  });

  it('英美千分位：逗号在前，小数点在后 → 逗号是千分位', () => {
    expect(sanitizeNumericCell('1,234.50')).toBe(1234.5);
    expect(sanitizeNumericCell('1,000')).toBe(1000);
  });

  it('欧陆格式：点在后逗号在前 → 逗号是小数点', () => {
    expect(sanitizeNumericCell('1.234,50')).toBe(1234.5);
  });

  it('括号表示负数', () => {
    expect(sanitizeNumericCell('(50)')).toBe(-50);
  });

  it('带空格（Excel 常带前后空白）', () => {
    expect(sanitizeNumericCell('  60  ')).toBe(60);
  });

  it('无法解析时返回 null —— 绝不返回 NaN 或 0', () => {
    expect(sanitizeNumericCell('abc')).toBeNull();
    expect(sanitizeNumericCell('')).toBeNull();
    expect(sanitizeNumericCell('   ')).toBeNull();
    expect(sanitizeNumericCell('¥')).toBeNull();
    expect(sanitizeNumericCell(null as unknown as string)).toBeNull();
  });
});

describe('parseSpreadsheetText 多行 TSV 解析', () => {
  it('按行与列切分', () => {
    expect(parseSpreadsheetText('60\t100\n20\t30')).toEqual([['60', '100'], ['20', '30']]);
  });

  it('兼容 Windows 换行', () => {
    expect(parseSpreadsheetText('60\t100\r\n20\t30')).toEqual([['60', '100'], ['20', '30']]);
  });

  it('裁掉尾部空行（Excel 复制常带尾换行）', () => {
    expect(parseSpreadsheetText('60\t100\n')).toEqual([['60', '100']]);
  });

  it('空输入返回空数组', () => {
    expect(parseSpreadsheetText('')).toEqual([]);
  });
});

describe('applySpreadsheetRows 应用到表格', () => {
  const cols = [
    { col: 'salesPrice', numeric: true },
    { col: 'stockQuantity', numeric: true },
  ];

  it('按起始行连续写入', () => {
    const written: Array<[number, string, number | string]> = [];
    const r = applySpreadsheetRows(2, cols, [['¥100.00', '5'], ['200', '8']],
      (row, col, v) => written.push([row, col, v]));
    expect(r.applied).toBe(4);
    expect(written).toEqual([
      [2, 'salesPrice', 100], [2, 'stockQuantity', 5],
      [3, 'salesPrice', 200], [3, 'stockQuantity', 8],
    ]);
  });

  it('清洗失败的单元格被跳过，而不是写 0', () => {
    const written: Array<[number, string, number | string]> = [];
    const r = applySpreadsheetRows(0, cols, [['abc', '5']],
      (row, col, v) => written.push([row, col, v]));
    // 售价列 abc 无法解析 → 跳过；库存列正常写入
    expect(written).toEqual([[0, 'stockQuantity', 5]]);
    expect(r.applied).toBe(1);
    expect(written.some(([, c, v]) => c === 'salesPrice' && v === 0)).toBe(false);
  });

  it('空单元格不写入（保留原值）', () => {
    const written: Array<[number, string, number | string]> = [];
    applySpreadsheetRows(0, cols, [['', '5']], (row, col, v) => written.push([row, col, v]));
    expect(written).toEqual([[0, 'stockQuantity', 5]]);
  });

  it('粘贴列多于目标列时忽略多余列并报告数量', () => {
    const written: Array<[number, string, number | string]> = [];
    const r = applySpreadsheetRows(0, cols, [['10', '5', '多余']],
      (row, col, v) => written.push([row, col, v]));
    expect(r.extraColumns).toBe(1);
    expect(written.map((w) => w[1])).toEqual(['salesPrice', 'stockQuantity']);
  });

  it('整行都无效时记入 invalidRows', () => {
    const r = applySpreadsheetRows(0, cols, [['abc', 'def']], () => { /* noop */ });
    expect(r.invalidRows).toEqual([0]);
    expect(r.applied).toBe(0);
  });
});
