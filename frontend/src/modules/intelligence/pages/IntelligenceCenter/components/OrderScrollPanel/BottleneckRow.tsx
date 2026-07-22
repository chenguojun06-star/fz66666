import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { FactoryBottleneckItem } from '@/services/intelligence/intelligenceApi';

export const BottleneckRow: React.FC<{ item: FactoryBottleneckItem }> = ({ item }) => {
  const navigate = useNavigate();
  const c = item.stuckPct < 20 ? '#e03030' : item.stuckPct < 50 ? '#f7a600' : '#39ff14';
  const focusNode = String(item.stuckStage || '').trim();
  const primaryOrderNo = String(item.worstOrders?.[0]?.orderNo || '').trim();

  const openOrder = (orderNo?: string) => {
    const safeOrderNo = String(orderNo || '').trim();
    if (!safeOrderNo) return;
    const query = new URLSearchParams({ orderNo: safeOrderNo });
    if (focusNode) query.set('focusNode', focusNode);
    navigate(`/production/progress-detail?${query.toString()}`);
  };

  return (
    <div
      className={`c-order-row c-bottleneck-row-clickable${primaryOrderNo ? ' clickable' : ''}`}
      role={primaryOrderNo ? 'button' : undefined}
      tabIndex={primaryOrderNo ? 0 : -1}
      onClick={() => openOrder(primaryOrderNo)}
      onKeyDown={(event) => {
        if (!primaryOrderNo) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openOrder(primaryOrderNo);
        }
      }}
      title={primaryOrderNo ? `打开 ${primaryOrderNo} 查看 ${focusNode || '工序'} 卡点` : undefined}
    >
      <div className="c-order-row-main">
        <span className="c-order-factory">{item.factoryName}</span>
        <div className="c-order-center">
          <span className="c-order-no" style={{ color: c }}>
            卡在 {item.stuckStage}&nbsp;·&nbsp;{item.stuckOrderCount ?? (item.worstOrders || []).length} 单
          </span>
          <div className="c-order-bar-wrap">
            <div className="c-order-bar" style={{ width: `${item.stuckPct}%`, background: c }} />
          </div>
          <div className="c-order-dates">
            {(item.worstOrders || []).slice(0, 2).map(w => (
              <button
                key={w.orderNo}
                type="button"
                className="c-order-chip-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  openOrder(w.orderNo);
                }}
                title={`打开 ${w.orderNo}`}
              >
                {w.orderNo}
              </button>
            ))}
          </div>
        </div>
        <div className="c-order-right">
          <span className="c-order-pct" style={{ color: c }}>{item.stuckPct}%</span>
        </div>
      </div>
    </div>
  );
};
