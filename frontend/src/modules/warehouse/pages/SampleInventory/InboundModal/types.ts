export interface InboundModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  initialValues?: Record<string, any>;
}

export type SizeColorMatrixRow = { color?: string; quantities?: number[] };

export type StyleSnapshot = {
  styleId: string;
  styleNo: string;
  styleName: string;
  patternNo: string;
  sampleCompletedTime: string;
  cover: string;
  colors: string[];
  sizes: string[];
  planRows: InboundPlanRow[];
};

export type InboundPlanRow = { key: string; color: string; size: string; quantity: number };

export type ExistingStockRow = { color?: string; size?: string; inventoryStatus?: string };
