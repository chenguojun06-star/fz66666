import React, { useState, useEffect } from 'react';
import { factoryShipmentApi } from '@/services/production/factoryShipmentApi';

export const ShipmentSumCell: React.FC<{ orderId: string }> = ({ orderId }) => {
  const [data, setData] = useState<Array<{
    color: string;
    sizes: Array<{ sizeName: string; quantity: number }>;
    total: number;
  }> | null>(null);
  useEffect(() => {
    factoryShipmentApi.getOrderDetailSum(orderId)
      .then(res => { if (res?.data?.length) setData(res.data); })
      .catch((err) => { console.warn('[Progress] 发货汇总加载失败:', err?.message || err); });
  }, [orderId]);
  if (!data) return <span className="u-fs-12" style={{ color: 'var(--color-border-antd)' }}>-</span>;
  return (
    <div className="u-fs-12 u-lh-18px">
      {data.map(row => (
        <div key={row.color} style={{ marginBottom: 1 }}>
          <span style={{ color: 'var(--color-gray-700)' }}>{row.color}: </span>
          {row.sizes.map(s => `${s.sizeName}:${s.quantity}`).join(' ')}
          <span className="u-ml-4" style={{ color: 'var(--color-text-quaternary)' }}>共{row.total}</span>
        </div>
      ))}
    </div>
  );
};
