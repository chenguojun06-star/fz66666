import type { StyleAttachment, StyleBom, StyleInfo, StyleProcess, StyleQuotation, StyleSize, WorkbenchSection } from '@/types/style';

export interface Props {
  record: StyleInfo;
  onClose: () => void;
  initialSection?: WorkbenchSection;
  onSync?: () => void | Promise<void>;
}

export interface WorkbenchData {
  detail: StyleInfo | null;
  bomList: StyleBom[];
  sizeList: StyleSize[];
  processList: StyleProcess[];
  attachments: StyleAttachment[];
  quotation: StyleQuotation | null;
}

export interface StageCard {
  key: string;
  title: string;
  count: string;
  meta: { label: string; color: 'success' | 'processing' | 'default'; percent: number };
  helper: string;
  availableTime: string | null;
  startTime: string | null;
  endTime: string | null;
  completed: boolean;
  budgetHours: number | null;
  budgetField: string | null;
  budgetCustomized: boolean;
}

export interface SizeColorConfig {
  sizes: any[];
  colors: any[];
  matrixRows: any[];
}
