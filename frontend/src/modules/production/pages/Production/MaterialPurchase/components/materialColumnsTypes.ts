/**
 * 采购物料表格列定义参数类型。
 *
 * 单独成文件的原因：`material*Columns.tsx` 需要引用 `UseMaterialColumnsParams`，
 * 若仍定义在 `useMaterialColumns.tsx` 中，会形成循环依赖。
 */
import type { FormInstance } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

export interface UseMaterialColumnsParams {
  dataSource: MaterialPurchaseType[];
  navigate: NavigateFunction;
  onOpenDetail?: (styleNo: string, orderNo?: string) => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  purchaseSortField: string;
  purchaseSortOrder: 'asc' | 'desc';
  onPurchaseSort: (field: string, order: 'asc' | 'desc') => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onView: (record: MaterialPurchaseType) => void;
  onEdit: (record: MaterialPurchaseType) => void;
  onRemark: (record: MaterialPurchaseType) => void;
  onDelete?: (record: MaterialPurchaseType) => void;
  onConfirmReturn?: (record: MaterialPurchaseType) => void;
  onReturnReset?: (record: MaterialPurchaseType) => void;
  onQualityIssue?: (record: MaterialPurchaseType) => void;
  isSupervisorOrAbove?: boolean;
  arrivalForm: FormInstance;
  setArrivalTarget: Dispatch<SetStateAction<MaterialPurchaseType | null>>;
  setCancelTarget: Dispatch<SetStateAction<MaterialPurchaseType | null>>;
  onApplyPickup?: (record: MaterialPurchaseType) => void;
}
