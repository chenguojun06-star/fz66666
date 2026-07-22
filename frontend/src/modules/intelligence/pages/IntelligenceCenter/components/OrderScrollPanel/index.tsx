import React, { useCallback } from 'react';
import { UpOutlined, DownOutlined } from '@ant-design/icons';
import { Virtuoso } from 'react-virtuoso';
import type { ProductionOrder } from '@/types/production';
import { LiveDot } from '../IntelligenceWidgets';
import { OrderRow } from './OrderRow';
import { AutoScrollBox } from './AutoScrollBox';
import { BottleneckRow } from './BottleneckRow';

export { AutoScrollBox, BottleneckRow };

export const OrderScrollPanel: React.FC<{
  orders: ProductionOrder[];
  collapsed?: boolean;
  onToggle?: () => void;
}> = ({ orders, collapsed = false, onToggle }) => {
  const rowRenderer = useCallback((index: number) => {
    const o = orders[index];
    if (!o) return null;
    return <OrderRow key={String(o.id)} order={o} />;
  }, [orders]);

  return (
    <div className="c-card c-breathe-green">
      <div className="c-card-title" style={{ cursor: onToggle ? 'pointer' : undefined }} onClick={onToggle}>
        <LiveDot size={7} />
        活跃订单实时滚动
        <span className="c-card-badge cyan-badge">{orders.length} 单进行中</span>
        <span style={{ fontSize: 14, color: '#4a8aaa', letterSpacing: 0 }}>悬停暂停 · 离开续滚 →</span>
        {onToggle && (
          <span
            style={{ marginLeft: 'auto', cursor: 'pointer', color: collapsed ? '#a78bfa' : '#5a7a9a', fontSize: 14, padding: '0 4px', display: 'inline-flex', alignItems: 'center', flexShrink: 0, userSelect: 'none' }}
            title={collapsed ? '展开面板' : '收起面板'}
          >
            {collapsed ? <DownOutlined /> : <UpOutlined />}
          </span>
        )}
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsed ? 0 : 600, transition: 'max-height 0.28s ease' }}>
        {orders.length > 0 ? (
          <AutoScrollBox className="c-orders-scroll">
            <Virtuoso
              totalCount={orders.length}
              itemContent={rowRenderer}
              style={{ height: Math.min(orders.length * 52, 560) }}
              overscan={200}
            />
          </AutoScrollBox>
        ) : (
          <div className="c-empty">暂无进行中订单</div>
        )}
      </div>
    </div>
  );
};
