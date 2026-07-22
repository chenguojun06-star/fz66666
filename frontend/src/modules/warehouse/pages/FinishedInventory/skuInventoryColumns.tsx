import React from 'react';
import { InputNumber, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatMoney } from '@/utils/format';
import type { SKUDetail } from './finishedInventoryTypes';

export interface SkuInventoryHandlers {
  handleSKUSalesPriceChange?: (index: number, val: number | null) => void;
  handleSKUPriceReasonChange?: (index: number, val: string) => void;
}

export function getSkuInventoryColumns(handlers: SkuInventoryHandlers): ColumnsType<SKUDetail> {
  return [
    {
      title: '可用库存',
      dataIndex: 'availableQty',
      key: 'availableQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '在途生产',
      dataIndex: 'inProductionQty',
      key: 'inProductionQty',
      width: 100,
      align: 'center',
      render: (qty: number) => {
        if (!qty || qty <= 0) return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
        return <span style={{ color: '#d46b08', fontWeight: 600 }}>{qty}</span>;
      },
    },
    {
      title: '销售欠数',
      dataIndex: 'pendingSalesQty',
      key: 'pendingSalesQty',
      width: 100,
      align: 'center',
      render: (qty: number) => {
        if (!qty || qty <= 0) return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
        return <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{qty}</span>;
      },
    },
    {
      title: '锁定库存',
      dataIndex: 'lockedQty',
      key: 'lockedQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '次品库存',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '成本价',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 90,
      align: 'center',
      render: (v: number) => v != null ? formatMoney(v) : '-',
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      key: 'salesPrice',
      width: 130,
      align: 'center',
      render: (v: number, record: SKUDetail, index: number) => {
        const priceChanged = record.originalSalesPrice != null && record.salesPrice !== record.originalSalesPrice;
        return (
          <div>
            <InputNumber
              min={0}
              precision={2}
              value={record.salesPrice ?? v}
              controls={false}
              onChange={(val) => handlers.handleSKUSalesPriceChange?.(index, val)}
              style={{ width: '100%' }}
              status={priceChanged ? 'warning' : undefined}
            />
            {record.originalSalesPrice != null && priceChanged && (
              <div style={{ fontSize: 12, color: 'var(--color-text-quaternary)', marginTop: 2 }}>
                原价: {formatMoney(record.originalSalesPrice)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '改价原因',
      dataIndex: 'priceAdjustmentReason',
      key: 'priceAdjustmentReason',
      width: 150,
      render: (v: string, record: SKUDetail, index: number) => {
        const priceChanged = record.originalSalesPrice != null && record.salesPrice !== record.originalSalesPrice;
        if (!priceChanged) return <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
        return (
          <Input
            value={record.priceAdjustmentReason || ''}
            onChange={e => handlers.handleSKUPriceReasonChange?.(index, e.target.value)}
            placeholder="必填"
            status={!record.priceAdjustmentReason?.trim() ? 'error' : undefined}
            style={{ width: '100%' }}
          />
        );
      },
    },
  ];
}
