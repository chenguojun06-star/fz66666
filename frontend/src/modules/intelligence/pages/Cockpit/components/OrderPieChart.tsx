import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Empty } from 'antd';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { StyleInfo } from '@/types/style';
import './OrderPieChart.css';

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const OrderPieChart: React.FC = () => {
  const { getDateRange } = useTimeDimension();
  const [loading, setLoading] = useState(true);
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const [stylesRes, ordersRes, scrappedRes] = await Promise.all([
        api.get<{ code: number; data: { records?: StyleInfo[] } }>('/style/info/list', {
          params: { page: 1, pageSize: 500 },
        }),
        api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
          params: { page: 1, pageSize: 500, startDate: start.toISOString(), endDate: end.toISOString(), excludeTerminal: true },
        }),
        api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
          params: { page: 1, pageSize: 500, startDate: start.toISOString(), endDate: end.toISOString(), status: 'scrapped' },
        }),
      ]);
      setStyles(stylesRes?.data?.records || []);
      setOrders([...(ordersRes?.data?.records || []), ...(scrappedRes?.data?.records || [])]);
    } catch (e) {
      console.error('Load order data failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const orderedStyleNos = new Set(orders.map(o => o.styleNo));
    const pendingStyles = styles.filter(s => !orderedStyleNos.has(s.styleNo));
    const productionOrders = orders.filter(o => String(o.status || '').toUpperCase() === 'PRODUCTION');
    const completedOrders = orders.filter(o => String(o.status || '').toUpperCase() === 'COMPLETED');
    const scrappedOrders = orders.filter(o => String(o.status || '').toUpperCase() === 'SCRAPPED');

    const pendingCount = pendingStyles.length;
    const productionCount = productionOrders.length;
    const completedCount = completedOrders.length;
    const scrappedCount = scrappedOrders.length;
    const scrappedQty = scrappedOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
    const total = pendingCount + productionCount + completedCount;
    const totalOrderQty = orders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    const todayOrders = orders.filter(o => isToday(String(o.createTime || o.createdAt || o.orderDate || '')));
    const todayOrderQty = todayOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    return { total, pendingCount, productionCount, completedCount, scrappedCount, scrappedQty, totalOrderQty, todayOrderCount: todayOrders.length, todayOrderQty };
  }, [styles, orders]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  if (stats.total === 0 && stats.totalOrderQty === 0) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;
  }

  return (
    <div className="order-card-wrapper">
      {/* 核心指标 */}
      <div className="order-metrics">
        <div className="order-metric">
          <div className="order-metric-value">{stats.pendingCount}</div>
          <div className="order-metric-label">待下单</div>
        </div>
        <div className="order-metric">
          <div className="order-metric-value order-metric-value--primary">{stats.productionCount}</div>
          <div className="order-metric-label">生产中</div>
        </div>
        <div className="order-metric">
          <div className="order-metric-value order-metric-value--success">{stats.completedCount}</div>
          <div className="order-metric-label">已完成</div>
        </div>
        <div className="order-metric">
          <div className="order-metric-value">{stats.totalOrderQty.toLocaleString()}</div>
          <div className="order-metric-label">总件数</div>
        </div>
      </div>

      {/* 今日数据 */}
      <div className="order-today-row">
        <div className="order-today-stat">
          <span className="order-today-label">今日下单</span>
          <span className="order-today-value">{stats.todayOrderCount}单</span>
        </div>
        <div className="order-today-stat">
          <span className="order-today-label">今日件数</span>
          <span className="order-today-value">{stats.todayOrderQty.toLocaleString()}件</span>
        </div>
      </div>

      {/* 报废预警 */}
      {stats.scrappedCount > 0 && (
        <div className="order-warning-row">
          <span className="order-warning-label">报废订单</span>
          <span className="order-warning-value">{stats.scrappedCount}单 / {stats.scrappedQty}件</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(OrderPieChart);
