import React from 'react';
import { Tag } from 'antd';
import type { ShippableInfo } from '@/services/production/factoryShipmentApi';

interface ShipSummaryBarProps {
  shippableInfo: ShippableInfo | null;
  alreadyShipped: number;
  canShip: number;
  currentTotal: number;
}

const ShipSummaryBar: React.FC<ShipSummaryBarProps> = ({
  shippableInfo, alreadyShipped, canShip, currentTotal,
}) => {
  return (
    <div style={{
      background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6,
      padding: '8px 14px', marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap',
    }}>
      <span>裁片总数：<b>{shippableInfo?.cuttingTotal ?? '-'}</b></span>
      <span>已发：<b style={{ color: '#096dd9' }}>{alreadyShipped}</b></span>
      <span>剩余可发：<b style={{ color: '#389e0d' }}>{canShip}</b></span>
      {currentTotal > 0 && (
        <span>本次发货：<b style={{ color: currentTotal > canShip ? 'var(--color-error)' : '#d46b08' }}>{currentTotal}</b>
          {currentTotal > canShip && <Tag color="red" style={{ marginLeft: 6, fontSize: 14 }}>超出可发数量</Tag>}
        </span>
      )}
    </div>
  );
};

export default ShipSummaryBar;
