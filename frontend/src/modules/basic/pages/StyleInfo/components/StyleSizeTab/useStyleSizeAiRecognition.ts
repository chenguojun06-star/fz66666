import React from 'react';
import { sortSizeNames } from '@/utils/api';
import { MatrixRow, normalizeRowSorts } from '../styleSize/shared';

interface UseStyleSizeAiRecognitionOptions {
  sizeColumns: string[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  setSizeColumns: React.Dispatch<React.SetStateAction<string[]>>;
  message: any;
  editMode: boolean;
  readOnly: boolean | undefined;
  enterEdit: () => void;
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
  const handleSizeTableRecognized = (result: { sizes: string[]; parts: any[] }) => {
    try {
      const recognizedSizes = (result.sizes || [])
        .map((s: string) => String(s || '').trim())
        .filter(Boolean);

      if (recognizedSizes.length === 0 && (result.parts || []).length === 0) {
        message.warning('未识别到尺码或部位信息');
        return;
      }

      const existingSizeSet = new Set(sizeColumns);
      const newSizes = recognizedSizes.filter((s: string) => !existingSizeSet.has(s));
      const allSizes = sortSizeNames([...sizeColumns, ...newSizes]);

      const partMap = new Map<string, {
        measureMethod: string;
        tolerance: string;
        sizeValues: Record<string, number>;
      }>();
      (result.parts || []).forEach((part: any) => {
        const partName = String(part.name || '').trim();
        if (!partName) return;
        const measureMethod = String(part.measureMethod || '').trim();
        const tolerance = String(part.tolerance || '').trim();
        const values = part.values || {};
        const sizeValues: Record<string, number> = {};
        Object.keys(values).forEach((key) => {
          const v = values[key];
          if (v === null || v === undefined || v === '') return;
          const n = Number(v);
          if (!Number.isNaN(n)) sizeValues[String(key).trim()] = n;
        });
        const prev = partMap.get(partName);
        if (prev) {
          partMap.set(partName, {
            measureMethod: measureMethod || prev.measureMethod,
            tolerance: tolerance || prev.tolerance,
            sizeValues: { ...prev.sizeValues, ...sizeValues },
          });
        } else {
          partMap.set(partName, { measureMethod, tolerance, sizeValues });
        }
      });

      setRows((prevRows) => {
        const updatedRows: MatrixRow[] = prevRows.map((r) => ({ ...r, cells: { ...r.cells } }));

        partMap.forEach((info, partName) => {
          const existingIndex = updatedRows.findIndex(
            (r) => r.partName === partName,
          );
          if (existingIndex >= 0) {
            const existing = updatedRows[existingIndex];
            const mergedCells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              const oldVal = existing.cells[sn]?.value ?? 0;
              const newVal = info.sizeValues[sn] ?? 0;
              const finalVal = oldVal !== 0 ? oldVal : newVal;
              mergedCells[sn] = { value: finalVal };
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
              key: `ai-row-${Date.now()}-${updatedRows.length}`,
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

        if (partMap.size === 0 && newSizes.length > 0) {
          updatedRows.forEach((r, idx, arr) => {
            const mergedCells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              if (r.cells && r.cells[sn]) {
                mergedCells[sn] = { ...r.cells[sn] };
              } else {
                mergedCells[sn] = { value: 0 };
              }
            });
            arr[idx] = { ...r, cells: mergedCells };
          });
        }

        return normalizeRowSorts(updatedRows);
      });

      setSizeColumns(allSizes);

      const msg: string[] = [];
      if (newSizes.length > 0) msg.push(`新增 ${newSizes.length} 个尺码（${newSizes.join(', ')}）`);
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
