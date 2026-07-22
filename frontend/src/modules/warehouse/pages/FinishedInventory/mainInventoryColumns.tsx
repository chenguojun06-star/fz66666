import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import type { FinishedInventory } from './finishedInventoryTypes';

export function getMainInventoryColumns(): ColumnsType<FinishedInventory> {
  return [
    {
      title: '库存状态',
      width: 260,
      render: (_, record) => (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%'
        }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>可用</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-success)' }}>
              {record.availableQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>锁定</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-warning)' }}>
              {record.lockedQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>次品</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: record.defectQty > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {record.defectQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
        </div>
      ),
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      width: 90,
      align: 'center' as const,
      render: (v: number | null) => v != null
        ? <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-error)' }}>{formatMoney(Number(v))}</span>
        : <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>,
    },
    {
      title: '入库',
      width: 190,
      render: (_, record) => (
        <div style={{ fontSize: 14, lineHeight: 2, color: 'var(--neutral-text)' }}>
          <div>{formatDateTime(record.lastInboundDate)}</div>
          <div>数量: <strong style={{ color: 'var(--color-success)' }}>{record.lastInboundQty ?? '-'}</strong> 件</div>
          <div>操作人: <strong>{record.lastInboundBy || '-'}</strong></div>
          <div style={{ color: 'var(--neutral-text-secondary)' }}>库位: {record.warehouseLocation || '-'}</div>
        </div>
      ),
    },
    {
      title: '出库',
      width: 190,
      render: (_, record) => (
        <div style={{ fontSize: 14, lineHeight: 2, color: 'var(--neutral-text)' }}>
          <div>{formatDateTime(record.lastOutboundDate)}</div>
          <div>单号: <strong style={{ color: 'var(--primary-color)' }}>{record.lastOutstockNo || '-'}</strong></div>
          <div>出库人: <strong>{record.lastOutboundBy || '-'}</strong></div>
        </div>
      ),
    },
  ];
}
