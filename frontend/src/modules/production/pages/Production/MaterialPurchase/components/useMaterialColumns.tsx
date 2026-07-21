import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import type { Dispatch, SetStateAction } from 'react';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { buildBasicColumns } from './materialBasicColumns';
import { buildQuantityPriceColumns } from './materialQuantityPriceColumns';
import { buildStatusActionColumns } from './materialStatusActionColumns';

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
}

/**
 * 采购物料表格列定义 Hook。
 * 仅做结构抽离，列渲染逻辑与原 MaterialTable 保持一致。
 */
export const useMaterialColumns = (params: UseMaterialColumnsParams): ColumnsType<MaterialPurchaseType> => {
  return [
    ...buildBasicColumns(params),
    ...buildQuantityPriceColumns(params),
    ...buildStatusActionColumns(params),
  ];
};
