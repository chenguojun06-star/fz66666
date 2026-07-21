import type { BomTableContainer, BomTableData, BomTableRow } from '../../../utils/templateUtils';

export interface BomInlineTableProps {
  value: BomTableData | BomTableContainer;
  onChange: (next: BomTableData | BomTableContainer) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export type BomEditableRow = BomTableRow & Record<string, unknown>;

export type BomEditableTableRow = BomEditableRow & {
  __rowKey: string;
};
