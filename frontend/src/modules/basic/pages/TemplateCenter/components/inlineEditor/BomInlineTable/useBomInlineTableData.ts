import { useMemo } from 'react';
import {
  isBomTableContainer,
  type BomTableContainer,
  type BomTableData,
  type BomTableRow,
} from '../../../utils/templateUtils';
import type { BomEditableRow, BomEditableTableRow } from './types';
import { createEmptyBomRow } from './helpers';

export interface UseBomInlineTableDataParams {
  value: BomTableData | BomTableContainer;
  onChange: (next: BomTableData | BomTableContainer) => void;
}

export interface UseBomInlineTableDataResult {
  rows: BomTableRow[];
  tableData: BomEditableTableRow[];
  updateRow: (index: number, updates: Partial<BomEditableRow>) => void;
  deleteRow: (index: number) => void;
  addRow: () => void;
}

export const useBomInlineTableData = ({
  value,
  onChange,
}: UseBomInlineTableDataParams): UseBomInlineTableDataResult => {
  const rows = isBomTableContainer(value) ? value.rows : value;

  const tableData = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        __rowKey: `bom-row-${index}`,
      })) as BomEditableTableRow[],
    [rows],
  );

  const commitRows = (nextRows: BomTableRow[]) => {
    if (isBomTableContainer(value)) {
      onChange({ ...value, rows: nextRows });
      return;
    }
    onChange(nextRows);
  };

  const updateRow = (index: number, updates: Partial<BomEditableRow>) => {
    const nextRows = [...rows];
    const current = nextRows[index] || {};
    nextRows[index] = { ...current, ...updates };
    commitRows(nextRows);
  };

  const deleteRow = (index: number) => {
    commitRows(rows.filter((_, currentIndex) => currentIndex !== index));
  };

  const addRow = () => {
    commitRows([...rows, createEmptyBomRow()]);
  };

  return { rows, tableData, updateRow, deleteRow, addRow };
};
