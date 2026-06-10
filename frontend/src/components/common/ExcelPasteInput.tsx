import React, { useCallback, useRef } from 'react';
import { InputNumber, message } from 'antd';
import { TableOutlined } from '@ant-design/icons';

/**
 * 解析从 Excel / Google Sheets 复制的文本为二维数组
 * 支持制表符分隔（Excel）和逗号分隔
 */
export const parseExcelClipboard = (text: string): string[][] => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  return lines.map((line) => line.split('\t'));
};

interface ExcelPasteInputProps {
  value?: number;
  onChange?: (value: number | null) => void;
  /** 粘贴多值时的回调，返回 true 表示已处理 */
  onPasteMultiValues?: (values: number[]) => boolean;
  style?: React.CSSProperties;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 支持从 Excel 复制粘贴的 InputNumber
 * - 粘贴单个值：直接填入当前单元格
 * - 粘贴多个值（同行/多行）：触发 onPasteMultiValues 回调
 */
const ExcelPasteInput: React.FC<ExcelPasteInputProps> = ({
  value,
  onChange,
  onPasteMultiValues,
  style,
  min,
  max,
  step = 0.1,
  precision,
  placeholder,
  disabled,
  className,
}) => {
  const inputRef = useRef<any>(null);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text || !text.trim()) return;

      const rows = parseExcelClipboard(text);

      // 展平所有值为一个数组
      const allValues: number[] = [];
      for (const row of rows) {
        for (const cell of row) {
          const trimmed = cell.trim();
          if (trimmed === '') continue;
          const num = Number(trimmed);
          if (!Number.isNaN(num)) {
            allValues.push(num);
          }
        }
      }

      if (allValues.length === 0) return;

      if (allValues.length === 1) {
        // 单值：直接填入当前单元格（让 InputNumber 默认行为处理）
        return;
      }

      // 多值：阻止默认行为，触发批量回调
      e.preventDefault();
      if (onPasteMultiValues) {
        const handled = onPasteMultiValues(allValues);
        if (handled) {
          message.success(`已粘贴 ${allValues.length} 个值`);
        }
      }
    },
    [onPasteMultiValues],
  );

  return (
    <InputNumber
      ref={inputRef}
      value={value}
      onChange={onChange}
      onPaste={handlePaste}
      min={min}
      max={max}
      step={step}
      precision={precision}
      controls={false}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={{ width: '100%', ...style }}
    />
  );
};

/**
 * 解析从 Excel 复制的文本为行列矩阵，并尝试匹配表格列
 * 返回按行排列的数值矩阵
 */
export const parseExcelToMatrix = (
  text: string,
  options?: { skipHeader?: boolean },
): number[][] => {
  const rows = parseExcelClipboard(text);
  const startIdx = options?.skipHeader ? 1 : 0;
  const matrix: number[][] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const rowValues: number[] = [];
    for (const cell of rows[i]) {
      const trimmed = cell.trim();
      if (trimmed === '') {
        rowValues.push(NaN);
      } else {
        rowValues.push(Number(trimmed));
      }
    }
    matrix.push(rowValues);
  }

  return matrix;
};

/**
 * 工具函数：将 Excel 粘贴的值按行填充到表格
 * @param startRowIndex 开始填充的行索引
 * @param startColIndex 开始填充的列索引
 * @param matrix 解析后的数值矩阵
 * @param rowCount 表格总行数
 * @param colCount 表格总列数
 * @param onFill 填充回调 (rowIndex, colIndex, value)
 */
export const fillMatrixToTable = (
  startRowIndex: number,
  startColIndex: number,
  matrix: number[][],
  rowCount: number,
  colCount: number,
  onFill: (rowIndex: number, colIndex: number, value: number) => void,
) => {
  let filledCount = 0;
  for (let r = 0; r < matrix.length; r++) {
    const targetRow = startRowIndex + r;
    if (targetRow >= rowCount) break;
    for (let c = 0; c < matrix[r].length; c++) {
      const targetCol = startColIndex + c;
      if (targetCol >= colCount) break;
      const val = matrix[r][c];
      if (!Number.isNaN(val)) {
        onFill(targetRow, targetCol, val);
        filledCount++;
      }
    }
  }
  return filledCount;
};

export default ExcelPasteInput;
