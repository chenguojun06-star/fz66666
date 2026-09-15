import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { FinishedInventory } from './finishedInventoryTypes';
import type { FinishedInventoryRow } from './flattenBySku';
import { mergeAcrossRows } from './flattenBySku';

export interface MainHandlers {
  handleOutbound: (record: FinishedInventory) => void;
  handleViewInboundHistory: (record: FinishedInventory) => void | Promise<void>;
  handleViewSkuDetail: (record: FinishedInventoryRow) => void;
}

export function getMainActionColumns(handlers: MainHandlers): ColumnsType<FinishedInventoryRow> {
  return [
    {
      title: '操作',
      width: 200,
      render: (_, record) =>
        mergeAcrossRows(
          <RowActions
            actions={[
              {
                key: 'detail',
                label: '详情',
                onClick: () => handlers.handleViewSkuDetail(record),
              },
              {
                key: 'outbound',
                label: '出库',
                primary: true,
                onClick: () => handlers.handleOutbound(record),
              },
              {
                key: 'history',
                label: '入库记录',
                onClick: () => handlers.handleViewInboundHistory(record),
              },
            ]}
          />,
          record
        ),
    },
  ];
}
