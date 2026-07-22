import type { ProcessTableData } from '../../../utils/templateUtils';

export interface ProcessInlineTableProps {
  value: ProcessTableData;
  onChange: (next: ProcessTableData) => void;
  readOnly?: boolean;
  compact?: boolean;
  allowProcessPriceImages: boolean;
  showSizePrices: boolean;
  onShowSizePricesChange: (next: boolean) => void;
  templateSizes: string[];
  newSizeName: string;
  onNewSizeNameChange: (next: string) => void;
  onAddSize: () => void;
  onRemoveSize: (size: string) => void;
  imageUrls: string[];
  imageUploading: boolean;
  onUploadImage: (file: File) => Promise<any>;
  onRemoveImage: (url: string) => void;
}

export interface ProcessStepRowWithIndex {
  _origIdx: number;
  [key: string]: any;
}
