import type { ColumnsType } from 'antd/es/table';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { buildBasicColumns } from './materialBasicColumns';
import type { UseMaterialColumnsParams } from './materialColumnsTypes';
import { buildQuantityPriceColumns } from './materialQuantityPriceColumns';
import { buildStatusActionColumns } from './materialStatusActionColumns';

/** 兼容旧引用路径：类型已移至 ./materialColumnsTypes（避免子文件反向依赖本文件） */
export type { UseMaterialColumnsParams } from './materialColumnsTypes';

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
