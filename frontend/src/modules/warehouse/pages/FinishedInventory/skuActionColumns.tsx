import React from 'react';
import { InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SKUDetail } from './finishedInventoryTypes';

export interface SkuActionHandlers {
  handleSKUQtyChange: (index: number, val: number | null) => void;
}

export function getSkuActionColumns(handlers: SkuActionHandlers): ColumnsType<SKUDetail> {
  return [
    {
      title: '出库数量',
      dataIndex: 'outboundQty',
      key: 'outboundQty',
      width: 120,
      align: 'center',
      render: (value: number, record: SKUDetail, index: number) => (
        <InputNumber
          min={0}
          max={record.availableQty}
          value={value}
          controls={false}
          onChange={(val) => handlers.handleSKUQtyChange(index, val)}
          style={{ width: '100%' }}
          placeholder="0"
        />
      ),
    },
  ];
}
