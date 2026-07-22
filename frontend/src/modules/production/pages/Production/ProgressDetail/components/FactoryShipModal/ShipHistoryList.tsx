import React from 'react';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import type { FactoryShipment } from '@/types/production';

interface ShipHistoryListProps {
  shipHistory: FactoryShipment[];
}

const ShipHistoryList: React.FC<ShipHistoryListProps> = ({ shipHistory }) => {
  if (shipHistory.length === 0) return null;

  return (
    <>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>历史发货记录</div>
      <div style={{
        background: 'var(--color-bg-container)', border: '1px solid var(--color-border-light)', borderRadius: 4,
        padding: '6px 10px', marginBottom: 12, maxHeight: 120, overflowY: 'auto',
      }}>
        {shipHistory.map((rec, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 0', fontSize: 14, borderBottom: i < shipHistory.length - 1 ? '1px solid var(--color-bg-subtle)' : 'none' }}>
            <span style={{ color: '#888', minWidth: 80 }}>
              {rec.shipTime ? dayjs(rec.shipTime).format('MM-DD HH:mm') : '-'}
            </span>
            <span><b>{rec.shipQuantity ?? '-'}</b> 件</span>
            {rec.trackingNo && <span style={{ color: 'var(--color-text-secondary)' }}>单号：{rec.trackingNo}</span>}
            {rec.receiveStatus && (
              <Tag color={rec.receiveStatus === 'received' ? 'success' : rec.receiveStatus === 'pending' ? 'processing' : 'default'} style={{ fontSize: 14, padding: '0 4px', lineHeight: '16px' }}>
                {rec.receiveStatus === 'received' ? '已收货' : rec.receiveStatus === 'pending' ? '待收货' : rec.receiveStatus}
              </Tag>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export default ShipHistoryList;
