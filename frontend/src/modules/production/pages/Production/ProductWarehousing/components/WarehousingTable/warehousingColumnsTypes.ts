/**
 * 成品入库表格列定义参数类型。
 *
 * 单独成文件的原因：`columns{Base,Quality,Action}.tsx` 需要引用
 * `BuildColumnsParams`，若仍定义在 `columns.tsx` 中，会形成循环依赖。
 */
import { ProductWarehousing as WarehousingType } from '@/types/production';

export interface BuildColumnsParams {
  goToDetail: (record: WarehousingType, tab?: string) => void;
  goToDetailPage: (record: WarehousingType, tab?: string) => void;
  isOrderFrozen: (orderId: string) => boolean;
  dataSource: WarehousingType[];
}
