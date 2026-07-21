import type { ProductionOrder } from '@/types/production';

export interface LabelStyleInfo {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  careIconCodes?: string;
}

export interface LabelPrintModalProps {
  open: boolean;
  onClose: () => void;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
}

export interface SkuRow {
  key: string;
  color: string;
  size: string;
  quantity: number;
  printCount: number;
  sku: string;
  styleImageUrl?: string;
  styleId?: string;
  styleNo?: string;
}

export interface SkuTableProps {
  open: boolean;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
  printColLabel: string;
  onPrint: (selected: SkuRow[], order: ProductionOrder, styleInfo: LabelStyleInfo | null) => Promise<void>;
  onClose: () => void;
}
