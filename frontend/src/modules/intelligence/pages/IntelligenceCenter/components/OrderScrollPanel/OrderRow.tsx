import React from 'react';
import { Popover } from 'antd';
import type { ProductionOrder } from '@/types/production';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { fmtD } from '../IntelligenceWidgets';
import { OrderPop } from './OrderPop';

export const OrderRow: React.FC<{ order: ProductionOrder }> = ({ order }) => {
  const prog = calcOrderProgress(order);
  const daysLeft = order.plannedEndDate
    ? Math.ceil((new Date(order.plannedEndDate).getTime() - Date.now()) / 86400000)
    : null;
  const riskColor = daysLeft !== null && daysLeft < 0 ? '#e03030'
    : daysLeft !== null && daysLeft <= 3 ? '#f7a600'
    : prog < 20 ? '#f7a600'
    : '#39ff14';
  return (
    <Popover
      overlayClassName="cockpit-order-pop"
      placement="left"
      content={<OrderPop order={order} />}
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0.05}
      getPopupContainer={() => (document.fullscreenElement as HTMLElement) || document.body}
    >
      <div className="c-order-row">
        <div className="c-order-row-main">
          <span className="c-order-factory">{order.factoryName ?? '—'}</span>
          <div className="c-order-center">
            <span className="c-order-no">{order.orderNo}</span>
            <div className="c-order-bar-wrap">
              <div className="c-order-bar" style={{ width: `${prog}%`, background: riskColor }} />
            </div>
            <div className="c-order-dates">
              <span>下单 {fmtD(order.createTime)}</span>
              <span>交期 {fmtD(order.plannedEndDate)}</span>
            </div>
          </div>
          <div className="c-order-right">
            <span className="c-order-pct" style={{ color: riskColor }}>{prog}%</span>
            {daysLeft !== null && (
              <span className="c-order-days" style={{
                color: daysLeft < 0 ? '#e03030' : daysLeft <= 3 ? '#f7a600' : '#3ab870',
              }}>
                {daysLeft < 0 ? `逾${-daysLeft}d` : `${daysLeft}d`}
              </span>
            )}
          </div>
        </div>
      </div>
    </Popover>
  );
};
