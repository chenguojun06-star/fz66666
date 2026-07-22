import React, { useCallback } from 'react';
import { toNumberSafe } from '@/utils/api';
import { MatrixRow, resolveGroupName, normalizeRowSorts } from '../styleSize/shared';

interface UseStyleSizeRowHandlersOptions {
  sizeColumns: string[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
}

export const useStyleSizeRowHandlers = ({
  sizeColumns,
  setRows,
}: UseStyleSizeRowHandlersOptions) => {
  const updatePartName = (rowKey: string, partName: string) =>
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, partName } : r)));

  const updateChunkGroupName = (chunkRowKeys: string[], groupName: string) => {
    const normalized = String(groupName || '').trim() || '其他区';
    if (!chunkRowKeys.length) return;
    const rowKeySet = new Set(chunkRowKeys);
    setRows((prev) => {
      let changed = false;
      const nextRows = prev.map((row) => {
        if (!rowKeySet.has(row.key)) return row;
        const currentGroup = resolveGroupName(row.groupName, row.partName);
        if (currentGroup === normalized && String(row.groupName || '').trim() === normalized) return row;
        changed = true;
        return { ...row, groupName: normalized };
      });
      return changed ? normalizeRowSorts(nextRows) : prev;
    });
  };

  const updateMeasureMethod = (rowKey: string, measureMethod: string) =>
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, measureMethod } : r)));

  const updateTolerance = (rowKey: string, tolerance: string) =>
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, tolerance } : r)));

  const updateCellValue = (rowKey: string, sizeName: string, value: number) =>
    setRows((prev) => prev.map((r) => r.key !== rowKey ? r : {
      ...r, cells: { ...r.cells, [sizeName]: { ...(r.cells[sizeName] || { value: 0 }), value: toNumberSafe(value) } },
    }));

  const handlePasteToRow = useCallback((rowKey: string, startSizeIndex: number, values: number[]) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== rowKey) return r;
      const nextCells = { ...r.cells };
      values.forEach((val, i) => {
        const targetIndex = startSizeIndex + i;
        if (targetIndex < sizeColumns.length) {
          const sizeName = sizeColumns[targetIndex];
          nextCells[sizeName] = { ...(nextCells[sizeName] || { value: 0 }), value: toNumberSafe(val) };
        }
      });
      return { ...r, cells: nextCells };
    }));
  }, [sizeColumns, setRows]);

  const handleDuplicateRow = useCallback((rowKey: string) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === rowKey);
      if (index < 0) return prev;
      const source = prev[index];
      const newRow: MatrixRow = {
        ...source,
        key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        partName: `${source.partName}(副本)`,
        cells: { ...source.cells },
        gradingZones: source.gradingZones.map((z) => ({
          ...z,
          key: `grading-zone-${Date.now()}-${Math.random()}`,
        })),
        imageUrls: undefined,
      };
      const nextRows = [...prev];
      nextRows.splice(index + 1, 0, newRow);
      return normalizeRowSorts(nextRows);
    });
  }, [setRows]);

  const setChunkImageUrls = (chunkRowKeys: string[], nextImages: string[]) => {
    const ownerRowKey = String(chunkRowKeys[0] || '');
    const rowKeySet = new Set(chunkRowKeys);
    const sanitized = nextImages.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2);
    setRows((prev) => prev.map((row) => {
      if (!rowKeySet.has(row.key)) return row;
      return {
        ...row,
        imageUrls: String(row.key) === ownerRowKey && sanitized.length ? sanitized : undefined,
      };
    }));
  };

  return {
    updatePartName,
    updateChunkGroupName,
    updateMeasureMethod,
    updateTolerance,
    updateCellValue,
    handlePasteToRow,
    handleDuplicateRow,
    setChunkImageUrls,
  };
};
