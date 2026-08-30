import type { ColumnsType } from 'antd/es/table';
import type { SKUDetail, FinishedInventory } from './finishedInventoryTypes';
import type { FinishedInventoryRow } from './flattenBySku';
import { getMainBasicColumns } from './mainBasicColumns';
import { getMainInventoryColumns } from './mainInventoryColumns';
import { getMainActionColumns } from './mainActionColumns';
import { getSkuBasicColumns } from './skuBasicColumns';
import { getSkuInventoryColumns } from './skuInventoryColumns';
import { getSkuActionColumns } from './skuActionColumns';

export type { SKUDetail, FinishedInventory } from './finishedInventoryTypes';
export type { FinishedInventoryRow } from './flattenBySku';

/** D-228：主表按商品编码拆行后，列类型改为编码级行类型 */
export function getMainColumns(handlers: {
  handleOutbound: (record: FinishedInventory) => void;
  handleViewInboundHistory: (record: FinishedInventory) => void;
}, indexOffset = 0): ColumnsType<FinishedInventoryRow> {
  return [
    ...getMainBasicColumns(indexOffset),
    ...getMainInventoryColumns(),
    ...getMainActionColumns(handlers),
  ];
}

export function getSkuColumns(handlers: {
  handleSKUQtyChange: (index: number, val: number | null) => void;
  handleSKUSalesPriceChange?: (index: number, val: number | null) => void;
  handleSKUPriceReasonChange?: (index: number, val: string) => void;
}): ColumnsType<SKUDetail> {
  return [
    ...getSkuBasicColumns(),
    ...getSkuInventoryColumns(handlers),
    ...getSkuActionColumns(handlers),
  ];
}
