import { useEffect, useMemo } from 'react';
import { toNumberSafe } from '@/utils/api';
import {
  MatrixCell,
  MatrixRow,
  DisplayRow,
  normalizeSizeList,
  resolveGroupName,
  resolveGroupToneMeta,
  normalizeChunkImageAssignments,
} from './shared';

interface Params {
  rows: MatrixRow[];
  editMode: boolean;
  linkedSizeColumns: string[];
  setSizeColumns: React.Dispatch<React.SetStateAction<string[]>>;
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
}

export function useStyleSizeDerived({
  rows,
  editMode,
  linkedSizeColumns,
  setSizeColumns,
  setRows,
}: Params) {
  const displayRows = useMemo<DisplayRow[]>(() => {
    const sortedRows = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const sortDiff = toNumberSafe(a.row.sort) - toNumberSafe(b.row.sort);
        return sortDiff !== 0 ? sortDiff : a.index - b.index;
      })
      .map((item) => item.row);

    const groupOrder: string[] = [];
    const grouped = new Map<string, MatrixRow[]>();
    sortedRows.forEach((row) => {
      const groupName = resolveGroupName(row.groupName, row.partName);
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
        groupOrder.push(groupName);
      }
      grouped.get(groupName)!.push(row);
    });

    const flatRows: DisplayRow[] = [];
    groupOrder.forEach((groupName) => {
      const groupRows = grouped.get(groupName) || [];
      const groupToneMeta = resolveGroupToneMeta(groupName);
      const groupChunkImageUrls = Array.isArray(groupRows[0]?.imageUrls) ? groupRows[0].imageUrls : [];
      const groupRowKeys = groupRows.map((item) => item.key);
      groupRows.forEach((row, localIndex) => {
        flatRows.push({
          ...row,
          resolvedGroupName: groupName,
          groupToneMeta,
          isGroupStart: localIndex === 0,
          isGroupChunkStart: localIndex === 0,
          groupChunkSpan: localIndex === 0 ? groupRows.length : 0,
          isImageChunkStart: localIndex === 0,
          imageChunkSpan: localIndex === 0 ? groupRows.length : 0,
          chunkImageUrls: groupChunkImageUrls.slice(0, 2),
          chunkRowKeys: groupRowKeys,
        });
      });
    });

    return flatRows;
  }, [rows]);

  const groupNameOptions = useMemo(() => {
    const optionSet = new Set<string>(['上装区', '下装区', '其他区']);
    rows.forEach((row) => {
      const groupName = resolveGroupName(row.groupName, row.partName);
      if (groupName) {
        optionSet.add(groupName);
      }
    });
    return Array.from(optionSet).map((groupName) => ({ value: groupName, label: groupName }));
  }, [rows]);

  useEffect(() => {
    if (editMode || !linkedSizeColumns.length) return;
    setSizeColumns((prev) => {
      const next = normalizeSizeList([...prev, ...linkedSizeColumns]);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    setRows((prev) => normalizeChunkImageAssignments(prev.map((row) => {
      const nextCells: Record<string, MatrixCell> = { ...row.cells };
      linkedSizeColumns.forEach((sizeName) => {
        if (!nextCells[sizeName]) {
          nextCells[sizeName] = { value: 0 };
        }
      });
      return {
        ...row,
        cells: nextCells,
      };
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, linkedSizeColumns]);

  return { displayRows, groupNameOptions };
}
