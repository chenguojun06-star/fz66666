import { ProductWarehousing as WarehousingType } from '@/types/production';
import { buildBaseColumns } from './columnsBase';
import { buildQualityColumns } from './columnsQuality';
import { buildActionColumns } from './columnsAction';

export interface BuildColumnsParams {
  goToDetail: (record: WarehousingType, tab?: string) => void;
  isOrderFrozen: (orderId: string) => boolean;
  dataSource: WarehousingType[];
}

export function buildColumns(params: BuildColumnsParams) {
  return [
    ...buildBaseColumns(params),
    ...buildQualityColumns(params),
    ...buildActionColumns(params),
  ];
}
