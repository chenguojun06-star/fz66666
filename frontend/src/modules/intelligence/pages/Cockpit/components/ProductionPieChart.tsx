import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Spin, Empty } from 'antd';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import './ProductionPieChart.css';

const PROCESS_STAGES = [
  { key: 'cutting', label: '裁剪', color: '#3b82f6', rateField: 'cuttingCompletionRate' },
  { key: 'secondaryProcess', label: '二次工艺', color: '#f59e0b', rateField: 'secondaryProcessRate' },
  { key: 'sewing', label: '车缝', color: '#10b981', rateField: 'sewingCompletionRate' },
  { key: 'tail', label: '尾部', color: '#8b5cf6', rateField: 'tailProcessRate' },
];

const formatDays = (days: number): string => {
  if (days < 1) return '<1天';
  if (days < 30) return `${Math.round(days)}天`;
  const months = Math.floor(days / 30);
  const remainDays = Math.round(days % 30);
  return remainDays > 0 ? `${months}月${remainDays}天` : `${months}月`;
};

const getStageRate = (order: ProductionOrder, rateField: string): number => {
  const rate = order[rateField as keyof ProductionOrder];
  if (rate == null) return 0;
  const numRate = typeof rate === 'number' ? rate : parseFloat(String(rate));
  return isNaN(numRate) ? 0 : numRate;
};

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos((angle * Math.PI) / 180),
  y: cy + r * Math.sin((angle * Math.PI) / 180),
});

const describeArc = (cx: number, cy: number, outerR: number, innerR: number, start: number, end: number) => {
  const sweep = end - start;
  if (sweep >= 360) {
    const s1 = polarToCartesian(cx, cy, outerR, start);
    const m1 = polarToCartesian(cx, cy, outerR, start + 180);
    const e1 = polarToCartesian(cx, cy, outerR, end);
    const s2 = polarToCartesian(cx, cy, innerR, end);
    const m2 = polarToCartesian(cx, cy, innerR, start + 180);
    const e2 = polarToCartesian(cx, cy, innerR, start);
    return `M${s1.x.toFixed(1)},${s1.y.toFixed(1)} A${outerR},${outerR} 0 1 1 ${m1.x.toFixed(1)},${m1.y.toFixed(1)} A${outerR},${outerR} 0 1 1 ${e1.x.toFixed(1)},${e1.y.toFixed(1)} L${s2.x.toFixed(1)},${s2.y.toFixed(1)} A${innerR},${innerR} 0 1 0 ${m2.x.toFixed(1)},${m2.y.toFixed(1)} A${innerR},${innerR} 0 1 0 ${e2.x.toFixed(1)},${e2.y.toFixed(1)} Z`;
  }
  const s1 = polarToCartesian(cx, cy, outerR, start);
  const e1 = polarToCartesian(cx, cy, outerR, end);
  const s2 = polarToCartesian(cx, cy, innerR, end);
  const e2 = polarToCartesian(cx, cy, innerR, start);
  const large = sweep > 180 ? 1 : 0;
  return `M${s1.x.toFixed(1)},${s1.y.toFixed(1)} A${outerR},${outerR} 0 ${large} 1 ${e1.x.toFixed(1)},${e1.y.toFixed(1)} L${s2.x.toFixed(1)},${s2.y.toFixed(1)} A${innerR},${innerR} 0 ${large} 0 ${e2.x.toFixed(1)},${e2.y.toFixed(1)} Z`;
};

interface ProductionPieChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

interface StageStat {
  key: string;
  label: string;
  color: string;
  notStarted: number;
  inProgress: number;
  completed: number;
}

const ProductionPieChart: React.FC<ProductionPieChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [factoryCapacity, setFactoryCapacity] = useState<FactoryCapacityItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange();
        const [ordersRes, factoryRes] = await Promise.all([
          api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
            params: {
              page: 1,
              pageSize: 1000,
              startDate: start.toISOString(),
              endDate: end.toISOString(),
            },
          }),
          api.get<{ code: number; data: FactoryCapacityItem[] }>('/production/order/factory-capacity'),
        ]);
        console.log('Orders:', ordersRes?.data?.records?.length);
        console.log('Factory capacity:', factoryRes?.data);
        setOrders(ordersRes?.data?.records || []);
        setFactoryCapacity(factoryRes?.data || []);
      } catch (e) {
        console.error('Load production data failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [dimension, getDateRange]);

  useEffect(() => {
    if (mode !== 'stage' || !containerRef.current) return;
    const el = containerRef.current;
    const parentEl = el.parentElement;
    const targetEl = parentEl || el;

    const update = () => {
      const w = targetEl.getBoundingClientRect().width;
      const h = targetEl.getBoundingClientRect().height;
      const minDim = Math.min(w, h);
      setScale(Math.max(0.5, Math.min(2.5, minDim / 400)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => ro.disconnect();
  }, [mode]);

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
    const totalOrders = orders.length;
    const inProgress = orders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION').length;
    const completed = orders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED').length;

    const totalQuantity = orders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    const stageStats: StageStat[] = PROCESS_STAGES.map(stage => {
      let filteredOrders = orders;
      if (stage.key === 'secondaryProcess') {
        filteredOrders = orders.filter(o => o.hasSecondaryProcess === true);
      }

      const notStarted = filteredOrders.filter(o => getStageRate(o, stage.rateField) === 0);
      const inProgress = filteredOrders.filter(o => {
        const rate = getStageRate(o, stage.rateField);
        return rate > 0 && rate < 100;
      });
      const completed = filteredOrders.filter(o => getStageRate(o, stage.rateField) >= 100);

      return {
        key: stage.key,
        label: stage.label,
        color: stage.color,
        notStarted: notStarted.reduce((sum, o) => sum + (o.orderQuantity || 0), 0),
        inProgress: inProgress.reduce((sum, o) => sum + (o.orderQuantity || 0), 0),
        completed: completed.reduce((sum, o) => sum + (o.orderQuantity || 0), 0),
      };
    });

    const completedOrders = orders.filter(o => o.actualStartDate && o.actualEndDate);
    let avgDays = 0;
    if (completedOrders.length > 0) {
      const totalDays = completedOrders.reduce((sum, o) => {
        const start = new Date(o.actualStartDate!).getTime();
        const end = new Date(o.actualEndDate!).getTime();
        return sum + (end - start) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDays = totalDays / completedOrders.length;
    }

    const factoryStats = (factoryCapacity || []).map(f => ({
      factoryName: f.factoryName || '未知工厂',
      orderCount: f.totalOrders || 0,
      totalQuantity: f.totalQuantity || 0,
      completedQuantity: 0,
      completionRate: f.deliveryOnTimeRate >= 0 ? f.deliveryOnTimeRate : 0,
      avgDeliveryDays: f.estimatedCompletionDays >= 0 ? f.estimatedCompletionDays : 0,
      overdueCount: f.overdueCount || 0,
      atRiskCount: f.atRiskCount || 0,
    })).sort((a, b) => b.totalQuantity - a.totalQuantity);

    console.log('Factory stats:', factoryStats);

    return { totalOrders, totalQuantity, inProgress, completed, stageStats, avgDays, factoryStats };
  }, [orders, factoryCapacity]);

  const pieSegments = useMemo(() => {
    const validSegments = stats.stageStats.filter(s => s.inProgress > 0);
    const totalCount = validSegments.reduce((s, c) => s + c.inProgress, 0) || 1;
    let angle = -90;
    return validSegments.map((seg) => {
      const sweep = (seg.inProgress / totalCount) * 360;
      const start = angle;
      const end = angle + sweep;
      const mid = start + sweep / 2;
      angle = end;

      const explodeOffset = 8;
      const explodeX = Math.cos((mid * Math.PI) / 180) * explodeOffset;
      const explodeY = Math.sin((mid * Math.PI) / 180) * explodeOffset;

      return {
        ...seg,
        start,
        end,
        mid,
        percent: Math.round((seg.inProgress / totalCount) * 100),
        explodeX,
        explodeY,
      };
    });
  }, [stats.stageStats]);

  if (loading) return <div className="pie-card-loading"><Spin /></div>;
  if (stats.totalQuantity === 0) return <div className="pie-card-empty"><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;

  if (mode === 'sidebar') {
    return (
      <div className="pie-sidebar">
        <div className="pie-sidebar-title">大货生产</div>
        <div className="pie-sidebar-total">{stats.totalQuantity}</div>
        <div className="pie-sidebar-rows">
          <div className="pie-sidebar-row">
            <span className="pie-sidebar-dot pie-sidebar-dot--dev" />
            <span>进行中</span>
            <span className="pie-sidebar-num">{stats.inProgress}</span>
          </div>
          <div className="pie-sidebar-row">
            <span className="pie-sidebar-dot pie-sidebar-dot--done" />
            <span>已完成</span>
            <span className="pie-sidebar-num">{stats.completed}</span>
          </div>
        </div>
      </div>
    );
  }

  const cx = 120, cy = 120, outer = 65, inner = 38;

  return (
    <div ref={containerRef} className="production-stage-wrapper" style={{ '--pie-scale': scale } as React.CSSProperties}>
      <div className="production-stage-header">
        <div className="production-stage-title">大货生产</div>
        <div className="production-stage-summary">
          <span className="summary-item">
            <span className="summary-num summary-num--inprogress">{stats.inProgress}</span>
            <span className="summary-label">进行中</span>
          </span>
          <span className="summary-item">
            <span className="summary-num summary-num--completed">{stats.completed}</span>
            <span className="summary-label">已完成</span>
          </span>
          <span className="summary-item">
            <span className="summary-num">{stats.totalQuantity}</span>
            <span className="summary-label">总数量</span>
          </span>
          <span className="summary-item">
            <span className="summary-num summary-num--time">{formatDays(stats.avgDays)}</span>
            <span className="summary-label">平均周期</span>
          </span>
        </div>
      </div>

      <div className="production-stage-content">
        <div className="production-stage-chart">
          <svg viewBox="0 0 240 240" className="production-stage-svg">
            <defs>
              <filter id="prod-pie-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3"/>
              </filter>
            </defs>
            {pieSegments.map(seg => {
              const offsetX = cx + seg.explodeX;
              const offsetY = cy + seg.explodeY;
              const labelPos = polarToCartesian(cx, cy, outer + 25, seg.mid);
              return (
                <g key={seg.key} filter="url(#prod-pie-shadow)">
                  <path
                    d={describeArc(offsetX, offsetY, outer, inner, seg.start, seg.end)}
                    fill={seg.color}
                    className="production-stage-segment"
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y - 6}
                    textAnchor="middle"
                    className="production-stage-percent"
                    fill={seg.color}
                  >
                    {seg.percent}%
                  </text>
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 8}
                    textAnchor="middle"
                    className="production-stage-pie-count"
                  >
                    {seg.inProgress}件
                  </text>
                </g>
              );
            })}
            <circle cx={cx} cy={cy} r={inner - 4} className="production-stage-center" />
            <text x={cx} y={cy - 6} textAnchor="middle" className="production-stage-total">{stats.totalQuantity}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="production-stage-center-label">总数</text>
          </svg>
        </div>

        <div className="production-stage-legend">
          {stats.stageStats.map(stage => {
            const total = stage.notStarted + stage.inProgress + stage.completed;
            const notStartedPercent = total > 0 ? Math.round((stage.notStarted / total) * 100) : 0;
            const inProgressPercent = total > 0 ? Math.round((stage.inProgress / total) * 100) : 0;
            const completedPercent = total > 0 ? Math.round((stage.completed / total) * 100) : 0;

            return (
              <div key={stage.key} className="production-legend-item">
                <div className="legend-header">
                  <span className="legend-dot" style={{ background: stage.color }} />
                  <span className="legend-label">{stage.label}</span>
                </div>
                <div className="legend-stats">
                  <span className="legend-stat legend-stat--notstarted">
                    未开始 {stage.notStarted}件 ({notStartedPercent}%)
                  </span>
                  <span className="legend-stat legend-stat--inprogress">
                    进行中 {stage.inProgress}件 ({inProgressPercent}%)
                  </span>
                  <span className="legend-stat legend-stat--completed">
                    已完成 {stage.completed}件 ({completedPercent}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {stats.factoryStats.length > 0 && (
        <div className="factory-stats">
          <div className="factory-stats-header">工厂生产统计</div>
          <div className="factory-stats-list">
            {stats.factoryStats.slice(0, 10).map(factory => (
              <div key={factory.factoryName} className="factory-stats-item">
                <span className="factory-name">{factory.factoryName}</span>
                <span className="factory-percent">
                  {stats.totalQuantity > 0 ? Math.round((factory.totalQuantity / stats.totalQuantity) * 100) : 0}%
                </span>
                <span className="factory-detail">{factory.orderCount}单</span>
                <span className="factory-detail">{factory.totalQuantity}件</span>
                <span className="factory-detail factory-completion">完成{factory.completionRate}%</span>
                <span className="factory-detail">交期{formatDays(factory.avgDeliveryDays)}</span>
                <span className={factory.overdueCount > 0 ? 'factory-overdue' : 'factory-detail'}>
                  {factory.overdueCount}单延期
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProductionPieChart);
