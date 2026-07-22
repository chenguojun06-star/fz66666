import type { ColumnsType } from 'antd/es/table';
import type { SKUDetail, FinishedInventory } from './finishedInventoryTypes';
import { getMainBasicColumns } from './mainBasicColumns';
import { getMainInventoryColumns } from './mainInventoryColumns';
import { getMainActionColumns } from './mainActionColumns';
import { getSkuBasicColumns } from './skuBasicColumns';
import { getSkuInventoryColumns } from './skuInventoryColumns';
import { getSkuActionColumns } from './skuActionColumns';

export type { SKUDetail, FinishedInventory } from './finishedInventoryTypes';

export function getMainColumns(handlers: {
  handleOutbound: (record: FinishedInventory) => void;
  handleViewInboundHistory: (record: FinishedInventory) => void;
}): ColumnsType<FinishedInventory> {
  return [
    ...getMainBasicColumns(),
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
