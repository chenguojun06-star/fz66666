/**
 * spreadsheetPaste — Excel 批量粘贴解析
 *
 * <h3>为什么要自己写（调研结论）</h3>
 * Medusa 的 DataGrid 也支持粘贴，但它<b>只切 \\t 不切 \\n</b>（单行），且
 * <b>不做数字清洗</b> —— 从 Excel 粘 `¥1,234.50` 会把字面量写进去。
 * Saleor 的实现完整得多：多行、按列映射、清洗数字。
 * → 本项目抄 Saleor 的口径。
 *
 * <h3>为什么必须清洗</h3>
 * 运营几乎一定会从 Excel 复制，而 Excel 里带的是<b>显示格式</b>而不是数值：
 *   ¥1,234.50   带货币符号
 *   1.234,50    欧陆格式（逗号是小数点）
 *   "60 "       带空格
 * 直接 Number() 会得到 NaN，把商品价格写成空 —— 比不支持粘贴更糟。
 */

/**
 * 判断一个数字串里逗号是小数点还是千分位。
 *
 * <p>规则（同 Saleor `sanitizeSpreadsheetInteger`）：
 * 若同时有 `.` 和 `,`，看<b>谁在后面</b>——后面那个才是小数分隔符。
 *   `1,234.50` → `.` 在后 → 去掉所有 `,` → 1234.50
 *   `1.234,50` → `,` 在后 → 去掉所有 `.` → 1234.50
 */
const isDecimalComma = (s: string): boolean => {
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  return lastComma > lastDot;
};

/**
 * 把一个单元格的值清洗成数字。
 *
 * @returns 合法数字；无法解析时返回 {@code null}（<b>不返回 NaN、不返回 0</b>）
 */
export const sanitizeNumericCell = (raw: string): number | null => {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // 去货币符号与单位：¥ $ ￥ € £ 元 件
  s = s.replace(/[¥￥$€£元件人民币]/g, '');
  // 全角空格与不可见字符
  s = s.replace(/[\s\u00a0]/g, '');
  if (!s) return null;

  // 括号表示负数：(123) → -123
  const negativeByParen = /^\((.*)\)$/.exec(s);
  if (negativeByParen) s = `-${negativeByParen[1]}`;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    s = isDecimalComma(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    // 只有一个逗号：千分位（1234,50 也可能是欧陆小数，两种都接受）
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length === 2 ? `${parts[0]}.${parts[1]}` : s.replace(/,/g, '');
  }

  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * 解析从 Excel 粘贴的多行 TSV。
 *
 * @param text 剪贴板纯文本
 * @returns 二维数组 [[行][列]]；尾部空行已裁剪
 */
export const parseSpreadsheetText = (text: string): string[][] => {
  if (!text) return [];
  const rows = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.split('\t'));
  // 裁掉尾部全空行（Excel 复制常带一个尾换行）
  while (rows.length > 0 && rows[rows.length - 1].every((c) => !String(c).trim())) {
    rows.pop();
  }
  return rows;
};

export type PasteResult = {
  /** 实际写入的单元格数 */
  applied: number;
  /** 无法解析的行（0-based，对应数据行） */
  invalidRows: number[];
  /** 被跳过的多余列（粘贴的列数多于目标列时） */
  extraColumns: number;
};

export type PasteTargetCol = {
  /** 列标识（写入函数据此分派字段） */
  col: string;
  /** 该列是否按数字清洗（false = 按文本原样写入） */
  numeric: boolean;
};

/**
 * 把粘贴内容应用到从 {@code startIndex} 开始的连续若干行。
 *
 * <p>清洗失败的单元格<b>跳过而非写 0</b> —— 从 Excel 粘进来一列脏数据时，
 * 写 0 会把商品价格变成 0 元、库存变成 0 件，比不粘贴危害大得多。
 *
 * @param startIndex 目标起始行（表格内索引，0-based）
 * @param targetCols 目标列定义（顺序与粘贴的列一一对应）
 * @param rawRows parseSpreadsheetText 的结果
 * @param apply 写入函数（行下标, 列标识, 值）
 */
export const applySpreadsheetRows = (
  startIndex: number,
  targetCols: PasteTargetCol[],
  rawRows: string[][],
  apply: (rowIndex: number, col: string, value: number | string) => void,
): PasteResult => {
  const result: PasteResult = { applied: 0, invalidRows: [], extraColumns: 0 };
  rawRows.forEach((cells, i) => {
    const rowIndex = startIndex + i;
    if (cells.length > targetCols.length) {
      result.extraColumns = Math.max(result.extraColumns, cells.length - targetCols.length);
    }
    let rowValid = false;
    targetCols.forEach((t, c) => {
      const raw = cells[c];
      if (raw == null || !String(raw).trim()) return;
      if (t.numeric) {
        const n = sanitizeNumericCell(raw);
        // 清洗失败 → 跳过，绝不写 0
        if (n == null) return;
        apply(rowIndex, t.col, n);
      } else {
        apply(rowIndex, t.col, String(raw).trim());
      }
      result.applied += 1;
      rowValid = true;
    });
    if (!rowValid) result.invalidRows.push(i);
  });
  return result;
};
