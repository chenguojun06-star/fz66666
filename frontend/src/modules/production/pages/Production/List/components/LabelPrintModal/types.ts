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
  // D-221：合格证字段（StyleInfo 已有，useLabelPrint hooks 透传）
  styleName?: string;
  salesPrice?: number | string;
  tagPrice?: number | string;
  executeStandard?: string;
  safetyCategory?: string;
  qualityGrade?: string;
  inspector?: string;
}

/** D-221：合格证行配置（勾选显隐 + 左右文字可编辑） */
export interface CertRowState {
  key: string;
  show: boolean;
  labelText: string;
  valueText: string;
}

export interface CertificateSectionState {
  titleText: string;
  rows: CertRowState[];
  showBarcode: boolean;
  barcodeTemplate: string;
  showBarcodeText: boolean;
  fontScale: number;
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
