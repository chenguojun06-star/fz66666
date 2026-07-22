import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { FinishedInventory } from './finishedInventoryTypes';

export interface MainHandlers {
  handleOutbound: (record: FinishedInventory) => void;
  handleViewInboundHistory: (record: FinishedInventory) => void;
}

export function getMainActionColumns(handlers: MainHandlers): ColumnsType<FinishedInventory> {
  return [
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'outbound',
              label: '出库',
              primary: true,
              onClick: () => handlers.handleOutbound(record)
            },
            {
              key: 'history',
              label: '入库记录',
              onClick: () => handlers.handleViewInboundHistory(record)
            }
          ]}
        />
      ),
    },
  ];
}
