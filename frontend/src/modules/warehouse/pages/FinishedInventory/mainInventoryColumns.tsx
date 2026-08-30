import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import type { FinishedInventory } from './finishedInventoryTypes';
import type { FinishedInventoryRow } from './flattenBySku';
import { mergeAcrossRows } from './flattenBySku';

/**
 * 单个库存指标：标签 + 「数值 件」紧凑两行。
 * 原实现把「件」单独占一行，三个指标就是 9 行文本，纵向冗余。
 */
function StockMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: 'var(--neutral-text-disabled)', fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.2 }}>
        {value.toLocaleString()}
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--neutral-text-disabled)', marginLeft: 3 }}>
          件
        </span>
      </span>
    </div>
  );
}

export function getMainInventoryColumns(): ColumnsType<FinishedInventoryRow> {
  return [
    {
      title: '库存状态',
      width: 200,
      render: (_, record) =>
        mergeAcrossRows(
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              width: '100%',
            }}
          >
            <StockMetric label="可用" value={record.availableQty} color="var(--color-success)" />
            <StockMetric label="锁定" value={record.lockedQty} color="var(--color-warning)" />
            <StockMetric
              label="次品"
              value={record.defectQty}
              color={record.defectQty > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
            />
          </div>,
          record
        ),
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      width: 92,
      align: 'center' as const,
      render: (v: number | null, record: FinishedInventoryRow) =>
        mergeAcrossRows(
          v != null ? (
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-error)' }}>
              {formatMoney(Number(v))}
            </span>
          ) : (
            <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
          ),
          record
        ),
    },
    {
      title: '入库',
      width: 150,
      render: (_, record) =>
        mergeAcrossRows(
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--neutral-text)' }}>
            <div>{formatDateTime(record.lastInboundDate)}</div>
            <div>
              数量:{' '}
              <strong style={{ color: 'var(--color-success)' }}>{record.lastInboundQty ?? '-'}</strong>{' '}
              件
            </div>
            <div style={{ color: 'var(--neutral-text-secondary)' }}>
              库位: {record.warehouseLocation || '-'}
            </div>
          </div>,
          record
        ),
    },
    {
      title: '出库',
      width: 150,
      render: (_, record) =>
        mergeAcrossRows(
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--neutral-text)' }}>
            <div>{formatDateTime(record.lastOutboundDate)}</div>
            <div style={{ color: 'var(--neutral-text-secondary)' }}>
              单号: {record.lastOutstockNo || '-'}
            </div>
          </div>,
          record
        ),
    },
  ];
}

export type { FinishedInventory };
