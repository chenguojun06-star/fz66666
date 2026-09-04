import React, { useRef } from 'react';
import { MatrixRow, normalizeRowSorts, normalizeSizeList } from '../styleSize/shared';

interface UseStyleSizeAiRecognitionOptions {
  sizeColumns: string[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  setSizeColumns: React.Dispatch<React.SetStateAction<string[]>>;
  message: any;
  editMode: boolean;
  readOnly: boolean | undefined;
  enterEdit: () => void;
}

interface PartInfo {
  measureMethod: string;
  tolerance: string;
  sizeValues: Record<string, number>;
}

/** 把 AI 识别的 parts 归并成「部位名 → 度量/公差/各码数值」，同名部位后者不覆盖已有值 */
function buildPartMap(parts: any[]): Map<string, PartInfo> {
  const map = new Map<string, PartInfo>();
  (parts || []).forEach((part: any) => {
    const partName = String(part?.name || '').trim();
    if (!partName) return;

    const sizeValues: Record<string, number> = {};
    const values = part.values || {};
    Object.keys(values).forEach((key) => {
      const v = values[key];
      if (v === null || v === undefined || v === '') return;
      const n = Number(v);
      if (!Number.isNaN(n)) sizeValues[String(key).trim()] = n;
    });

    const measureMethod = String(part.measureMethod || '').trim();
    const tolerance = String(part.tolerance || '').trim();
    const prev = map.get(partName);
    if (prev) {
      map.set(partName, {
        measureMethod: measureMethod || prev.measureMethod,
        tolerance: tolerance || prev.tolerance,
        sizeValues: { ...prev.sizeValues, ...sizeValues },
      });
    } else {
      map.set(partName, { measureMethod, tolerance, sizeValues });
    }
  });
  return map;
}

export const useStyleSizeAiRecognition = ({
  sizeColumns,
  setRows,
  setSizeColumns,
  message,
  editMode,
  readOnly,
  enterEdit,
}: UseStyleSizeAiRecognitionOptions) => {
  // 识别批次自增序号。
  // 原实现行 key 为 `ai-row-${Date.now()}-${下标}`：同一毫秒内连续识别两次
  // 会生成完全相同的 key，React 复用错误节点，表现为删除/新增部位时整表"乱跳"。
  // 改为「时间戳 + 自增批次 + 部位名」，全局唯一。
  const batchRef = useRef(0);

  const handleSizeTableRecognized = (result: { sizes: string[]; parts: any[] }) => {
    try {
      const recognizedSizes = (result.sizes || [])
        .map((s: string) => String(s || '').trim())
        .filter(Boolean);

      if (recognizedSizes.length === 0 && (result.parts || []).length === 0) {
        message.warning('未识别到尺码或部位信息');
        return;
      }

      // D-29x：码数列固定为表格当前已有码数，AI 识别只负责把数值填进对应部位，
      // 绝不因识别结果替换/追加码数列——此前用识别码数整列覆盖，遇到跳码说明、
      // 说明文字被识别成"码数"时会铺进来一堆重复码（XS XS S S...）。
      // 仅当表格本身还没有任何码数时，才用识别结果初始化码数列。
      const initColsFromRecognition = sizeColumns.length === 0;
      const allSizes = normalizeSizeList(
        initColsFromRecognition ? recognizedSizes : sizeColumns,
      );
      const partMap = buildPartMap(result.parts || []);
      const batch = ++batchRef.current;

      setRows((prevRows) => {
        const updatedRows: MatrixRow[] = prevRows.map((r) => ({ ...r, cells: { ...r.cells } }));

        partMap.forEach((info, partName) => {
          const existingIndex = updatedRows.findIndex((r) => r.partName === partName);
          if (existingIndex >= 0) {
            const existing = updatedRows[existingIndex];
            const mergedCells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              // 覆盖优先：AI 识别到的值直接采用（含识别为 0），未识别到的格保留原值
              const rawNew = info.sizeValues[sn];
              mergedCells[sn] = {
                value: rawNew !== undefined ? rawNew : (existing.cells[sn]?.value ?? 0),
              };
            });
            updatedRows[existingIndex] = {
              ...existing,
              cells: mergedCells,
              measureMethod: info.measureMethod || existing.measureMethod,
              tolerance: info.tolerance || existing.tolerance,
            };
          } else {
            const cells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              cells[sn] = { value: info.sizeValues[sn] ?? 0 };
            });
            updatedRows.push({
              key: `ai-row-${Date.now()}-${batch}-${partName}`,
              groupName: '',
              partName,
              measureMethod: info.measureMethod || '',
              baseSize: '',
              gradingZones: [],
              tolerance: info.tolerance || '',
              sort: updatedRows.length,
              cells,
            } as MatrixRow);
          }
        });

        // 只识别到码数未识别到部位时：把每行补齐/裁剪到新的码数列
        if (partMap.size === 0) {
          updatedRows.forEach((r, idx, arr) => {
            const mergedCells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              mergedCells[sn] = r.cells?.[sn] ? { ...r.cells[sn] } : { value: 0 };
            });
            arr[idx] = { ...r, cells: mergedCells };
          });
        }

        return normalizeRowSorts(updatedRows);
      });

      if (initColsFromRecognition) setSizeColumns(allSizes);

      const msg: string[] = [];
      if (initColsFromRecognition && recognizedSizes.length > 0) {
        msg.push(`已用识别结果初始化码数（${allSizes.join(', ')}）`);
      } else if (recognizedSizes.length > 0) {
        msg.push('码数列保持不变，仅填充识别到的数值');
      }
      if (partMap.size > 0) msg.push(`导入 ${partMap.size} 个部位数据`);
      if (msg.length) message.success(msg.join('，'));

      if (!editMode && !readOnly) {
        enterEdit();
      }
    } catch (error) {
      console.error('[AI识别尺寸表] 处理失败:', error);
      message.error('处理识别结果失败，请重试');
    }
  };

  return { handleSizeTableRecognized };
};
