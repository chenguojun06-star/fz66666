import { buildBasicColumns } from './columns/basicColumns';
import { buildFactoryColumns } from './columns/factoryColumns';
import { buildTimeColumns } from './columns/timeColumns';
import { buildProgressColumns } from './columns/progressColumns';
import { buildQuantityColumns } from './columns/quantityColumns';
import { buildStatusColumns } from './columns/statusColumns';
import { buildActionColumns } from './columns/actionColumns';

export type { UseProductionColumnsProps } from './columns/types';
import type { UseProductionColumnsProps } from './columns/types';

export function useProductionColumns(props: UseProductionColumnsProps) {
  return [
    ...buildBasicColumns(props),
    ...buildFactoryColumns(props),
    ...buildTimeColumns(props),
    ...buildProgressColumns(props),
    ...buildQuantityColumns(props),
    ...buildStatusColumns(props),
    ...buildActionColumns(props),
  ];
}
