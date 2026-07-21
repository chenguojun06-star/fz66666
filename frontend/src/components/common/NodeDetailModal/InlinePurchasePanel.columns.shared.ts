import type { ColumnsType } from 'antd/es/table';
import type { MaterialPurchase } from '@/types/production';

export interface EditColumnHandlers {
  handleUpdateRow: (rowId: string, field: string, value: any) => void;
  handleOpenMaterialModal: (rowId: string) => void;
  handleRemoveRow: (rowId: string) => void;
  orderColors: string[];
}

export interface DisplayColumnHandlers {
  handleReceive: (record: MaterialPurchase) => void;
  handleInbound: (record: MaterialPurchase) => void;
  handleConfirmReturn: (record: MaterialPurchase) => void;
  handleReturnReset: (record: MaterialPurchase) => void;
  handleCancelReceive: (record: MaterialPurchase) => void;
  handleWarehousePick: (record: MaterialPurchase, pickQty: number) => void;
  handleQualityIssue: (record: MaterialPurchase) => void;
  stockMap: Record<string, number>;
  bomIncomplete: boolean;
}

export const rid = (r: MaterialPurchase) => String(r.id || '');

export type { ColumnsType, MaterialPurchase };
