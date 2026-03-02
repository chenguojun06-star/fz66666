/**
 * RiskDashboardPanel — 订单风险仪表盘（纯前端计算，0 新增接口）
 * 显示三类风险：高风险（逾期/临期且进度低）/ 临期预警 / 停滞订单
 * 位置：ProgressDetail 过滤栏下方
 */
import React, { useMemo } from 'react';
import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';

interface Props {
  orders: ProductionOrder[];
  boardTimesByOrder: Record<string, Record<string, string>>;
  stagnantOrderIds: Map<string, number>;
  /** 点击订单卡：将表格定位到该订单 */
  onLocate: (orderNo: string) => void;
}

interface RiskItem {
  id: string;
  orderNo: string;
  factoryName: string;
  hint: string;   // 显示原因
}

const MAX_SHOW = 3;

const RiskDashboardPanel: React.FC<Props> = ({
  orders,
  boardTimesByOrder,
  stagnantOrderIds,
  onLocate,
}) => {
  const now = dayjs();

  const { highRisk, approaching, stagnant } = useMemo(() => {
    const hr: RiskItem[] = [];
    const ap: RiskItem[] = [];
    const sg: RiskItem[] = [];

    const active = orders.filter(o => o.status !== 'completed' && o.id);

    for (const o of active) {
      const orderId = String(o.id);
      const prog = Number(o.productionProgress) || 0;
      const planEnd = o.plannedEndDate ? dayjs(o.plannedEndDate) : null;
      const daysLeft = planEnd ? planEnd.diff(now, 'day') : null;

      const item: RiskItem = {
        id: orderId,
        orderNo: o.orderNo || '',
        factoryName: o.factoryName || '未指定工厂',
        hint: '',
      };

      // 高风险：逾期 OR (≤3天且进度<60%)
      if (daysLeft !== null && (daysLeft < 0 || (daysLeft <= 3 && prog < 60))) {
        item.hint = daysLeft < 0
          ? `逾期 ${-daysLeft} 天 · 进度 ${prog}%`
          : `仅剩 ${daysLeft} 天 · 进度 ${prog}%`;
        hr.push({ ...item });
      }
      // 临期预警：3~7天且进度<80%（且不是高风险）
      else if (daysLeft !== null && daysLeft <= 7 && daysLeft > 3 && prog < 80) {
        item.hint = `还剩 ${daysLeft} 天 · 进度 ${prog}%`;
        ap.push({ ...item });
      }

      // 停滞（可与上面并存）
      if (stagnantOrderIds.has(orderId)) {
        const staleDays = stagnantOrderIds.get(orderId) ?? 0;
        const stuckNode = Object.entries(boardTimesByOrder[orderId] ?? {})
          .sort(([, a], [, b]) => b.localeCompare(a))[0]?.[0] ?? '';
        sg.push({
          ...item,
          hint: `${stuckNode ? stuckNode + ' · ' : ''}停工 ${staleDays} 天`,
        });
      }
    }

    return { highRisk: hr, approaching: ap, stagnant: sg };
  }, [orders, boardTimesByOrder, stagnantOrderIds, now]);

  // 三列都为空时不渲染
  if (!highRisk.length && !approaching.length && !stagnant.length) return null;

  const renderItems = (items: RiskItem[], color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.slice(0, MAX_SHOW).map(item => (
        <Tooltip key={item.id} title={`${item.factoryName} — ${item.hint}`}>
          <div
            onClick={() => onLocate(item.orderNo)}
            style={{
              cursor: 'pointer',
              padding: '3px 6px',
              borderRadius: 4,
              background: '#fafafa',
              border: `1px solid #f0f0f0`,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fafafa')}
          >
            <span style={{ fontWeight: 600, fontSize: 12, color: '#333', flexShrink: 0 }}>
              {item.orderNo}
            </span>
            <span style={{ fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.hint}
            </span>
          </div>
        </Tooltip>
      ))}
      {items.length > MAX_SHOW && (
        <span style={{ fontSize: 11, color: '#999', paddingLeft: 4 }}>
          还有 {items.length - MAX_SHOW} 单...
        </span>
      )}
    </div>
  );

  const col = (
    icon: string,
    label: string,
    count: number,
    color: string,
    bgColor: string,
    items: RiskItem[],
  ) => (
    <div style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 6, background: bgColor }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
        <Tag color={color === '#ff4d4f' ? 'red' : color === '#fa8c16' ? 'orange' : 'default'}
          style={{ margin: 0, lineHeight: '16px', height: 16, fontSize: 11, padding: '0 4px' }}>
          {count}
        </Tag>
      </div>
      {count === 0
        ? <span style={{ fontSize: 11, color: '#bbb' }}>暂无</span>
        : renderItems(items, color)}
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 10px',
        background: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      {col('🔴', '高风险', highRisk.length,   '#ff4d4f', '#fff2f0', highRisk)}
      <div style={{ width: 1, background: '#f0f0f0', flexShrink: 0 }} />
      {col('🟡', '临期预警', approaching.length, '#fa8c16', '#fffbe6', approaching)}
      <div style={{ width: 1, background: '#f0f0f0', flexShrink: 0 }} />
      {col('⏸',  '停滞订单', stagnant.length,   '#8c8c8c', '#fafafa',  stagnant)}
    </div>
  );
};

export default RiskDashboardPanel;
