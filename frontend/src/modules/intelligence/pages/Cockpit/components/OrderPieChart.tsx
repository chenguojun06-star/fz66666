import React, { useEffect, useState, useMemo, useRef } from 'react';
import PieChartCard, { PieSegment } from '@/components/PieChartCard';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { StyleInfo } from '@/types/style';
import type { ProductionOrder } from '@/types/production';
import './OrderPieChart.css';

interface OrderPieChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

interface StyleStats {
  styleNo: string;
  styleName: string;
  orderCount: number;
  totalQty: number;
}

const OrderPieChart: React.FC<OrderPieChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange();
        const [stylesRes, ordersRes] = await Promise.all([
          api.get<{ code: number; data: { records?: StyleInfo[] } }>('/style/info/list', {
            params: { page: 1, pageSize: 500 },
          }),
          api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
            params: {
              page: 1,
              pageSize: 500,
              startDate: start.toISOString(),
              endDate: end.toISOString(),
              excludeTerminal: true,
            },
          }),
        ]);
        setStyles(stylesRes?.data?.records || []);
        setOrders(ordersRes?.data?.records || []);
      } catch (e) {
        console.error('Load order data failed:', e);
      } finally {
        setLoading(false);
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

  const stats = useMemo(() => {
    const orderedStyleNos = new Set(orders.map(o => o.styleNo));
    const pendingStyles = styles.filter(s => !orderedStyleNos.has(s.styleNo));
    const productionOrders = orders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION');
    const completedOrders = orders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED');

    const pendingCount = pendingStyles.length;
    const productionCount = productionOrders.length;
    const completedCount = completedOrders.length;
    const total = pendingCount + productionCount + completedCount;

    const stageQuantities: PieSegment[] = [
      { key: 'pending', label: '待下单', color: '#64748b', count: pendingCount },
      { key: 'production', label: '生产中', color: '#3b82f6', count: productionCount },
      { key: 'completed', label: '已完成', color: '#10b981', count: completedCount },
    ];

    const styleMap = new Map<string, StyleStats>();
    orders.forEach(o => {
      if (!o.styleNo) return;
      const key = o.styleNo;
      const existing = styleMap.get(key) || {
        styleNo: o.styleNo,
        styleName: o.styleName || o.styleNo,
        orderCount: 0,
        totalQty: 0,
      };
      existing.orderCount++;
      existing.totalQty += o.orderQuantity || 0;
      styleMap.set(key, existing);
    });

    const styleStats = Array.from(styleMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 8);

    const totalOrderQty = orders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    return { total, pendingCount, productionCount, completedCount, stageQuantities, styleStats, totalOrderQty };
  }, [styles, orders]);

  const segments: PieSegment[] = stats.stageQuantities;

  return (
    <div className="order-pie-wrapper">
      <PieChartCard
        mode={mode}
        title="下单管理"
        total={stats.total}
        inProgress={stats.productionCount}
        completed={stats.completedCount}
        avgTime={stats.totalOrderQty > 0 ? `共${stats.totalOrderQty}件` : undefined}
        segments={segments}
        loading={loading}
      />

      {mode === 'stage' && stats.styleStats.length > 0 && (
        <div className="order-style-stats">
          <div className="order-style-stats-header">款号下单统计</div>
          <div className="order-style-stats-list">
            {stats.styleStats.map(style => (
              <div key={style.styleNo} className="order-style-stats-item">
                <span className="order-style-no">{style.styleNo}</span>
                <span className="order-style-percent">
                  {stats.totalOrderQty > 0 ? Math.round((style.totalQty / stats.totalOrderQty) * 100) : 0}%
                </span>
                <span className="order-style-detail">{style.orderCount}单</span>
                <span className="order-style-detail order-style-qty">{style.totalQty}件</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(OrderPieChart);
