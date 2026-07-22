import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTimeDimension } from '../../contexts/TimeDimensionContext';
import { useStyleLink } from '../../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import PieCard from './PieCard';
import TrendChart from './TrendChart';
import '../OverviewChart.css';

interface TrendData {
  date: string;
  orderCount: number;
  productionCount: number;
  inboundCount: number;
}

interface OverviewChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

const COLORS = {
  order: { ring: '#3b82f6', text: 'var(--color-text-secondary)' },
  production: { ring: 'var(--color-accent-emerald)', text: 'var(--color-text-secondary)' },
  inbound: { ring: '#8b5cf6', text: 'var(--color-text-secondary)' },
};

const OverviewChart: React.FC<OverviewChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (mode !== 'stage' || !containerRef.current) return;
    const el = containerRef.current;
    const parentEl = el.parentElement;
    const targetEl = parentEl || el;

    const update = () => {
      const w = targetEl.getBoundingClientRect().width;
      const h = targetEl.getBoundingClientRect().height;
      const minDim = Math.min(w, h);
      setScale(Math.max(0.5, Math.min(2, minDim / 500)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { start, end } = getDateRange();
        const res = await api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
          params: {
            page: 1,
            pageSize: 500,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            excludeTerminal: true,
          },
        });
        setOrders(res?.data?.records || []);
      } catch (e) {
        console.error('Load overview data failed:', e);
      }
    };
    void loadData();
  }, [dimension, getDateRange]);

  const styleList = useMemo(() => {
    return orders
      .filter(o => o.styleNo)
      .map(o => ({ styleNo: o.styleNo, styleName: o.styleName }));
  }, [orders]);

  const prevStyleListRef = useRef<string>('');
  const prevPositionRef = useRef<string>('');

  useEffect(() => {
    if (mode !== 'stage' || !styleLink || !moduleKey || !position || styleList.length === 0) return;

    const styleListKey = styleList.map(s => s.styleNo).sort().join(',');
    const positionKey = `${position.x},${position.y},${position.width},${position.height}`;

    if (prevStyleListRef.current === styleListKey && prevPositionRef.current === positionKey) {
      return;
    }

    prevStyleListRef.current = styleListKey;
    prevPositionRef.current = positionKey;

    styleLink.registerStyle(moduleKey, styleList, position);
  }, [mode, styleLink, moduleKey, position, styleList]);

  useEffect(() => {
    return () => {
      if (styleLink && moduleKey) {
        styleLink.unregisterModule(moduleKey);
      }
    };
  }, [styleLink, moduleKey]);

  const trendData = useMemo<TrendData[]>(() => {
    const { start, end } = getDateRange();
    const data: TrendData[] = [];
    let points = 7;

    switch (dimension) {
      case 'day': points = 24; break;
      case 'week': points = 7; break;
      case 'month': points = 30; break;
      case 'year': points = 12; break;
    }

    const msPerPoint = (end.getTime() - start.getTime()) / points;

    for (let i = 0; i < points; i++) {
      const pointStart = new Date(start.getTime() + i * msPerPoint);
      const pointEnd = new Date(start.getTime() + (i + 1) * msPerPoint);
      let label = '';

      if (dimension === 'day') {
        label = `${pointStart.getHours().toString().padStart(2, '0')}:00`;
      } else if (dimension === 'week' || dimension === 'month') {
        label = `${(pointStart.getMonth() + 1).toString().padStart(2, '0')}-${pointStart.getDate().toString().padStart(2, '0')}`;
      } else {
        label = `${pointStart.getFullYear()}-${(pointStart.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      const periodOrders = orders.filter(o => {
        const dateStr = String(o.createTime || o.createdAt || o.orderDate || '');
        if (!dateStr || dateStr === 'undefined') return false;
        const orderDate = new Date(dateStr);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= pointStart && orderDate < pointEnd;
      });

      const orderCount = periodOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
      const productionCount = periodOrders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION').reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
      const inboundCount = periodOrders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED').reduce((sum, o) => sum + (o.inStockQuantity || o.orderQuantity || 0), 0);

      data.push({ date: label, orderCount, productionCount, inboundCount });
    }

    return data;
  }, [orders, dimension, getDateRange]);

  const stats = useMemo(() => {
    const { start, end } = getDateRange();

    const filteredOrders = orders.filter(o => {
      const dateStr = String(o.createTime || o.createdAt || o.orderDate || '');
      if (!dateStr || dateStr === 'undefined') return false;
      const orderDate = new Date(dateStr);
      if (isNaN(orderDate.getTime())) return false;
      return orderDate >= start && orderDate <= end;
    });

    const totalOrders = filteredOrders.length;
    const totalOrderQty = filteredOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
    const productionOrders = filteredOrders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION');
    const productionQty = productionOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
    const completedOrders = filteredOrders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED');
    const inboundQty = completedOrders.reduce((sum, o) => sum + (o.inStockQuantity || o.orderQuantity || 0), 0);

    const days = dimension === 'day' ? 1 : dimension === 'week' ? 7 : dimension === 'month' ? 30 : 365;
    const avgOrderCycle = totalOrders > 0 ? Math.round((days / totalOrders) * 10) / 10 : 0;
    const avgOrderQty = totalOrders > 0 ? Math.round(totalOrderQty / totalOrders) : 0;
    const avgProductionTime = productionQty > 0 ? Math.round((days * 24 / productionQty) * 10) / 10 : 0;
    const avgInboundTime = inboundQty > 0 ? Math.round((days * 24 / inboundQty) * 10) / 10 : 0;

    return {
      order: { count: totalOrders, qty: totalOrderQty, avgCycle: avgOrderCycle, avgQty: avgOrderQty },
      production: { count: productionOrders.length, qty: productionQty, avgTime: avgProductionTime },
      inbound: { count: completedOrders.length, qty: inboundQty, avgTime: avgInboundTime },
    };
  }, [orders, dimension, getDateRange]);

  const total = stats.order.count + stats.production.count + stats.inbound.count;

  return (
    <div ref={containerRef} className="overview-chart-wrapper" style={{ '--ov-scale': scale } as React.CSSProperties}>
      {mode === 'sidebar' ? (
        <div className="overview-sidebar-mode">
          <div className="overview-sidebar-title">业务概览</div>
          <div className="overview-sidebar-stats">
            <span>下单 {stats.order.count}单</span>
            <span>生产 {stats.production.count}单</span>
            <span>入库 {stats.inbound.qty}件</span>
          </div>
        </div>
      ) : (
        <>
          <div className="overview-pies">
            <PieCard
              title="下单"
              count={stats.order.count}
              total={total}
              color={COLORS.order.ring}
              stats={[
                { value: stats.order.avgCycle, unit: '天/单' },
                { value: stats.order.avgQty, unit: '件/单' },
              ]}
            />
            <PieCard
              title="生产"
              count={stats.production.count}
              total={total}
              color={COLORS.production.ring}
              stats={[
                { value: stats.production.qty, unit: '件' },
                { value: stats.production.avgTime, unit: '时/件' },
              ]}
            />
            <PieCard
              title="入库"
              count={stats.inbound.count}
              total={total}
              color={COLORS.inbound.ring}
              stats={[
                { value: stats.inbound.qty, unit: '件' },
                { value: stats.inbound.avgTime, unit: '时/件' },
              ]}
            />
          </div>
          <TrendChart data={trendData} colors={COLORS} />
        </>
      )}
    </div>
  );
};

export default React.memo(OverviewChart);
