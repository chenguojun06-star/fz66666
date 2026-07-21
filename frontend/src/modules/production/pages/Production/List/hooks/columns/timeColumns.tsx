import React from 'react';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { displayDate } from '@/utils/display';
import type { UseProductionColumnsProps } from './types';

export function buildTimeColumns({
  sortField,
  sortOrder,
  handleSort,
}: UseProductionColumnsProps): any[] {
  const renderStageTime = (value: unknown) => displayDate(value, 'datetime');

  return [
    {
      title: <SortableColumnTitle
        title="下单时间"
        sortField={sortField}
        fieldName="createTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"
      />,
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: renderStageTime,
    },
    {
      title: <SortableColumnTitle title="预计出货" sortField={sortField} fieldName="expectedShipDate" sortOrder={sortOrder} onSort={handleSort} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 100,
      render: (v: any) => displayDate(v, 'datetime'),
    },
  ];
}
