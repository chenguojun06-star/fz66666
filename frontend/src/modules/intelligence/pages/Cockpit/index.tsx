import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined, AlertOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { TimeDimensionProvider, useTimeDimension } from './contexts/TimeDimensionContext';
import { StyleLinkProvider } from './contexts/StyleLinkContext';
import TimeDimensionSelector from './components/TimeDimensionSelector';
import StyleLinkLines from './components/StyleLinkLines';
import OverviewChart from './components/OverviewChart';
import OrderPieChart from './components/OrderPieChart';
import SamplePieChart from './components/SamplePieChart';
import ProductionPieChart from './components/ProductionPieChart';
import ProcurementPieChart from './components/ProcurementPieChart';
import WarehousePieChart from './components/WarehousePieChart';
import InsightCard from './components/InsightCard';
import api from '@/utils/api';
import type { StyleInfo } from '@/types/style';
import type { ProductionOrder } from '@/types/production';
import type { MaterialPurchase } from '@/types/production';
import './styles.css';

const STORAGE_KEY = 'cockpit-widgets';
const LAYOUT_VERSION = 'v2';

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

interface TodayStats {
  overview: { orderQty: number; inboundQty: number; outboundQty: number };
  order: { orderQty: number };
  sample: { newCount: number; completedCount: number };
  production: { completedQty: number };
  procurement: { newCount: number; completedCount: number };
  warehouse: { outboundQty: number };
}

interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WidgetState {
  overview: { placed: boolean } & WidgetPosition;
  order: { placed: boolean } & WidgetPosition;
  sample: { placed: boolean } & WidgetPosition;
  production: { placed: boolean } & WidgetPosition;
  procurement: { placed: boolean } & WidgetPosition;
  warehouse: { placed: boolean } & WidgetPosition;
  insight: { placed: boolean } & WidgetPosition;
}

const DEFAULT_WIDGETS: WidgetState = {
  overview: { placed: true, x: 0, y: 0, width: 520, height: 420 },
  order: { placed: true, x: 530, y: 0, width: 380, height: 420 },
  sample: { placed: true, x: 920, y: 0, width: 380, height: 420 },
  production: { placed: true, x: 0, y: 430, width: 380, height: 420 },
  procurement: { placed: true, x: 390, y: 430, width: 380, height: 420 },
  warehouse: { placed: true, x: 780, y: 430, width: 380, height: 420 },
  insight: { placed: true, x: 1170, y: 430, width: 380, height: 420 },
};

const loadWidgetState = (): WidgetState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed._version === LAYOUT_VERSION) {
        const { _version, ...widgets } = parsed;
        return { ...DEFAULT_WIDGETS, ...widgets };
      }
    }
  } catch {}
  return DEFAULT_WIDGETS;
};

const TodayStatsContext = React.createContext<TodayStats>({
  overview: { orderQty: 0, inboundQty: 0, outboundQty: 0 },
  order: { orderQty: 0 },
  sample: { newCount: 0, completedCount: 0 },
  production: { completedQty: 0 },
  procurement: { newCount: 0, completedCount: 0 },
  warehouse: { outboundQty: 0 },
});

const useTodayStats = () => React.useContext(TodayStatsContext);

const TodayStatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dimension } = useTimeDimension();
  const [stats, setStats] = useState<TodayStats>({
    overview: { orderQty: 0, inboundQty: 0, outboundQty: 0 },
    order: { orderQty: 0 },
    sample: { newCount: 0, completedCount: 0 },
    production: { completedQty: 0 },
    procurement: { newCount: 0, completedCount: 0 },
    warehouse: { outboundQty: 0 },
  });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [ordersRes, stylesRes, purchasesRes] = await Promise.all([
          api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
            params: { page: 1, pageSize: 1000 },
          }),
          api.get<{ code: number; data: { records?: StyleInfo[] } }>('/style/info/list', {
            params: { page: 1, pageSize: 500 },
          }),
          api.get<{ code: number; data: { records?: MaterialPurchase[] } }>('/production/purchase/list', {
            params: { page: 1, pageSize: 500 },
          }),
        ]);

        const orders = ordersRes?.data?.records || [];
        const styles = stylesRes?.data?.records || [];
        const purchases = purchasesRes?.data?.records || [];

        const todayOrders = orders.filter(o => isToday(String(o.createTime || o.createdAt || o.orderDate)));
        const todayOrderQty = todayOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

        const todayInboundOrders = orders.filter(o =>
          isToday(String(o.instockTime || o.instockDate)) ||
          (String(o.status||'').toUpperCase() === 'COMPLETED' && isToday(String(o.actualEndDate)))
        );
        const todayInboundQty = todayInboundOrders.reduce((sum, o) => sum + (o.inStockQuantity || o.orderQuantity || 0), 0);

        const todayNewStyles = styles.filter(s => isToday(s.createTime));
        const todayCompletedStyles = styles.filter(s => isToday(s.sampleCompletedTime));

        const todayCompletedOrders = orders.filter(o =>
          String(o.status||'').toUpperCase() === 'COMPLETED' && isToday(o.actualEndDate)
        );
        const todayCompletedQty = todayCompletedOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

        const todayNewPurchases = purchases.filter(p => isToday(String(p.createTime || p.createdAt)));
        const todayCompletedPurchases = purchases.filter(p => isToday(String(p.completionTime || p.completedAt)));

        const todayOutboundOrders = orders.filter(o => isToday(String(o.outstockTime || o.outstockDate)));
        const todayOutboundQty = todayOutboundOrders.reduce((sum, o) => sum + (o.outstockQuantity || 0), 0);

        setStats({
          overview: { orderQty: todayOrderQty, inboundQty: todayInboundQty, outboundQty: todayOutboundQty },
          order: { orderQty: todayOrderQty },
          sample: { newCount: todayNewStyles.length, completedCount: todayCompletedStyles.length },
          production: { completedQty: todayCompletedQty },
          procurement: { newCount: todayNewPurchases.length, completedCount: todayCompletedPurchases.length },
          warehouse: { outboundQty: todayOutboundQty },
        });
      } catch (e) {
        console.error('Load today stats failed:', e);
      }
    };
    void loadStats();
  }, [dimension]);

  return (
    <TodayStatsContext.Provider value={stats}>
      {children}
    </TodayStatsContext.Provider>
  );
};

const WIDGET_META: Record<keyof WidgetState, { label: string; priority: 'critical' | 'high' | 'normal'; icon: string }> = {
  overview: { label: '业务概览', priority: 'critical', icon: '📊' },
  order: { label: '下单管理', priority: 'high', icon: '📋' },
  production: { label: '大货生产', priority: 'critical', icon: '🏭' },
  sample: { label: '样衣开发', priority: 'high', icon: '✂️' },
  procurement: { label: '物料采购', priority: 'normal', icon: '📦' },
  warehouse: { label: '成品仓库', priority: 'normal', icon: '🏪' },
  insight: { label: 'AI 智能洞察', priority: 'critical', icon: '🧠' },
};

const CockpitPage: React.FC = () => {
  const [widgets, setWidgets] = useState<WidgetState>(loadWidgetState);
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: keyof WidgetState;
    startX: number;
    startY: number;
    startWidgetX: number;
    startWidgetY: number;
    startWidth: number;
    startHeight: number;
    mode: 'move' | 'resize';
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ _version: LAYOUT_VERSION, ...widgets }));
    } catch {}
  }, [widgets]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const moduleKey = e.dataTransfer.getData('text/module-key') as keyof WidgetState;
    if (moduleKey && moduleKey in widgets && !widgets[moduleKey].placed) {
      const rect = containerRef.current?.getBoundingClientRect();
      const x = e.clientX - (rect?.left || 0) - 100;
      const y = e.clientY - (rect?.top || 0) - 100;
      setWidgets(prev => ({
        ...prev,
        [moduleKey]: {
          placed: true,
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: DEFAULT_WIDGETS[moduleKey]?.width || 380,
          height: DEFAULT_WIDGETS[moduleKey]?.height || 420,
        },
      }));
    }
  }, [widgets]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleRemove = useCallback((key: keyof WidgetState) => {
    setWidgets(prev => ({
      ...prev,
      [key]: { ...prev[key], placed: false },
    }));
  }, []);

  const handleRefresh = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    setRefreshKey(k => k + 1);
  }, []);

  const handleMouseDown = useCallback((key: keyof WidgetState, e: React.MouseEvent, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const widget = widgets[key];
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      startWidgetX: widget.x,
      startWidgetY: widget.y,
      startWidth: widget.width,
      startHeight: widget.height,
      mode,
    };
  }, [widgets]);

  useEffect(() => {
    let rafId: number | null = null;
    let pendingDelta = { x: 0, y: 0 };

    const updatePosition = () => {
      if (!dragRef.current) return;
      const { key, startX: _startX, startY: _startY, startWidgetX, startWidgetY, startWidth, startHeight, mode } = dragRef.current;
      const deltaX = pendingDelta.x;
      const deltaY = pendingDelta.y;

      setWidgets(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          x: mode === 'move' ? Math.max(0, startWidgetX + deltaX) : prev[key].x,
          y: mode === 'move' ? Math.max(0, startWidgetY + deltaY) : prev[key].y,
          width: mode === 'resize' ? Math.max(300, startWidth + deltaX) : prev[key].width,
          height: mode === 'resize' ? Math.max(280, startHeight + deltaY) : prev[key].height,
        },
      }));
      rafId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      pendingDelta.x = e.clientX - dragRef.current.startX;
      pendingDelta.y = e.clientY - dragRef.current.startY;
      if (!rafId) {
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    const handleMouseUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const hasPlacedWidgets = useMemo(() =>
    (Object.keys(widgets) as (keyof WidgetState)[]).some(k => widgets[k].placed),
    [widgets]
  );

  const unplacedWidgets = useMemo(() =>
    (Object.keys(widgets) as (keyof WidgetState)[]).filter(k => !widgets[k].placed),
    [widgets]
  );

  return (
    <Layout>
      <TimeDimensionProvider>
        <TodayStatsProvider>
          <StyleLinkProvider>
            <CockpitContent
              widgets={widgets}
              setWidgets={setWidgets}
              refreshKey={refreshKey}
              containerRef={containerRef}
              handleMouseDown={handleMouseDown}
              handleDrop={handleDrop}
              handleDragOver={handleDragOver}
              handleRemove={handleRemove}
              handleRefresh={handleRefresh}
              hasPlacedWidgets={hasPlacedWidgets}
              unplacedWidgets={unplacedWidgets}
            />
          </StyleLinkProvider>
        </TodayStatsProvider>
      </TimeDimensionProvider>
    </Layout>
  );
};

interface CockpitContentProps {
  widgets: WidgetState;
  setWidgets: React.Dispatch<React.SetStateAction<WidgetState>>;
  refreshKey: number;
  containerRef: React.RefObject<HTMLDivElement>;
  handleMouseDown: (key: keyof WidgetState, e: React.MouseEvent, mode: 'move' | 'resize') => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleRemove: (key: keyof WidgetState) => void;
  handleRefresh: () => void;
  hasPlacedWidgets: boolean;
  unplacedWidgets: (keyof WidgetState)[];
}

const CockpitContent: React.FC<CockpitContentProps> = ({
  widgets,
  refreshKey,
  containerRef,
  handleMouseDown,
  handleDrop,
  handleDragOver,
  handleRemove,
  handleRefresh,
  hasPlacedWidgets,
  unplacedWidgets,
}) => {
  const todayStats = useTodayStats();

  const kpiItems = useMemo(() => [
    { label: '今日下单', value: todayStats.overview.orderQty, unit: '件', color: '#a78bfa', trend: 'order' },
    { label: '今日入库', value: todayStats.overview.inboundQty, unit: '件', color: '#34d399', trend: 'inbound' },
    { label: '今日出库', value: todayStats.overview.outboundQty, unit: '件', color: '#f472b6', trend: 'outbound' },
    { label: '今日完成', value: todayStats.production.completedQty, unit: '件', color: '#60a5fa', trend: 'production' },
    { label: '样衣完成', value: todayStats.sample.completedCount, unit: '款', color: '#fbbf24', trend: 'sample' },
    { label: '采购完成', value: todayStats.procurement.completedCount, unit: '单', color: '#fb923c', trend: 'procurement' },
  ], [todayStats]);

  const anomalyDetected = useMemo(() => {
    const anomalies: string[] = [];
    if (todayStats.overview.orderQty > 0 && todayStats.overview.inboundQty === 0) {
      anomalies.push('有下单但无入库');
    }
    if (todayStats.sample.newCount > 0 && todayStats.sample.completedCount === 0) {
      anomalies.push('样衣无完成');
    }
    if (todayStats.procurement.newCount > 3) {
      anomalies.push('采购单激增');
    }
    return anomalies;
  }, [todayStats]);

  const renderWidget = (key: keyof WidgetState) => {
    const w = widgets[key];
    if (!w.placed) return null;
    const meta = WIDGET_META[key];

    const statTags: Record<keyof WidgetState, React.ReactNode> = {
      overview: (
        <>
          <span className="cockpit-stat-tag">下单 {todayStats.overview.orderQty}件</span>
          <span className="cockpit-stat-tag cockpit-stat-tag--success">入库 {todayStats.overview.inboundQty}件</span>
          <span className="cockpit-stat-tag cockpit-stat-tag--outbound">出库 {todayStats.overview.outboundQty}件</span>
        </>
      ),
      order: <span className="cockpit-stat-tag">今日下单 {todayStats.order.orderQty}件</span>,
      sample: (
        <>
          <span className="cockpit-stat-tag">下样 {todayStats.sample.newCount}</span>
          <span className="cockpit-stat-tag cockpit-stat-tag--success">完成 {todayStats.sample.completedCount}</span>
        </>
      ),
      production: <span className="cockpit-stat-tag cockpit-stat-tag--success">完成 {todayStats.production.completedQty}件</span>,
      procurement: (
        <>
          <span className="cockpit-stat-tag">新增 {todayStats.procurement.newCount}</span>
          <span className="cockpit-stat-tag cockpit-stat-tag--success">完成 {todayStats.procurement.completedCount}</span>
        </>
      ),
      warehouse: <span className="cockpit-stat-tag cockpit-stat-tag--outbound">出库 {todayStats.warehouse.outboundQty}件</span>,
      insight: null,
    };

    const chartMap: Record<keyof WidgetState, React.ReactNode> = {
      overview: <OverviewChart key={refreshKey} mode="stage" moduleKey="overview" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
      order: <OrderPieChart key={refreshKey} mode="stage" moduleKey="order" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
      sample: <SamplePieChart key={refreshKey} mode="stage" moduleKey="sample" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
      production: <ProductionPieChart key={refreshKey} mode="stage" moduleKey="production" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
      procurement: <ProcurementPieChart key={refreshKey} mode="stage" moduleKey="procurement" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
      warehouse: <WarehousePieChart key={refreshKey} mode="stage" moduleKey="warehouse" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
      insight: <InsightCard key={refreshKey} mode="stage" moduleKey="insight" position={{ x: w.x, y: w.y, width: w.width, height: w.height }} />,
    };

    return (
      <div
        key={key}
        className={`cockpit-widget cockpit-widget--${meta.priority}`}
        style={{ left: w.x, top: w.y, width: w.width, height: w.height }}
      >
        <div className="cockpit-widget-header" onMouseDown={(e) => handleMouseDown(key, e, 'move')}>
          <span className="cockpit-widget-priority" data-priority={meta.priority} />
          <span className="cockpit-widget-icon">{meta.icon}</span>
          <span className="cockpit-widget-title">{meta.label}</span>
          <span className="cockpit-widget-stats">{statTags[key]}</span>
          <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove(key)}>×</Button>
        </div>
        <div className="cockpit-widget-body">{chartMap[key]}</div>
        <div className="cockpit-widget-resize" onMouseDown={(e) => handleMouseDown(key, e, 'resize')} />
      </div>
    );
  };

  return (
    <div className="cockpit-workbench">
      <div className="cockpit-kpi-bar">
        <div className="cockpit-kpi-items">
          {kpiItems.map((item) => (
            <div key={item.label} className="cockpit-kpi-item">
              <span className="cockpit-kpi-value" style={{ color: item.color }}>{item.value}</span>
              <span className="cockpit-kpi-unit">{item.unit}</span>
              <span className="cockpit-kpi-label">{item.label}</span>
            </div>
          ))}
        </div>
        {anomalyDetected.length > 0 && (
          <Tooltip title={anomalyDetected.join('；')}>
            <div className="cockpit-kpi-alert">
              <AlertOutlined /> {anomalyDetected.length}项异常
            </div>
          </Tooltip>
        )}
      </div>

      <div className="cockpit-body">
        {unplacedWidgets.length > 0 && (
          <aside className="cockpit-sidebar">
            <div className="cockpit-sidebar-header">
              <div className="cockpit-sidebar-title">可用模块</div>
              <div className="cockpit-sidebar-subtitle">拖拽到看板区域添加</div>
            </div>
            {unplacedWidgets.map((key) => {
              const meta = WIDGET_META[key];
              return (
                <div key={key} className="cockpit-sidebar-section">
                  <div
                    className={`cockpit-module-card cockpit-module-card--${meta.priority}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/module-key', key);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div className="cockpit-module-card-header">
                      <span className="cockpit-module-priority" data-priority={meta.priority} />
                      <span className="cockpit-module-icon">{meta.icon}</span>
                      <span className="cockpit-module-label">{meta.label}</span>
                    </div>
                    <div className="cockpit-module-card-body">
                      {key === 'overview' && <OverviewChart key={refreshKey} mode="sidebar" />}
                      {key === 'order' && <OrderPieChart key={refreshKey} mode="sidebar" />}
                      {key === 'sample' && <SamplePieChart key={refreshKey} mode="sidebar" />}
                      {key === 'production' && <ProductionPieChart key={refreshKey} mode="sidebar" />}
                      {key === 'procurement' && <ProcurementPieChart key={refreshKey} mode="sidebar" />}
                      {key === 'warehouse' && <WarehousePieChart key={refreshKey} mode="sidebar" />}
                      {key === 'insight' && <InsightCard key={refreshKey} mode="sidebar" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </aside>
        )}

        <main className="cockpit-main" onDrop={handleDrop} onDragOver={handleDragOver}>
          <div className="cockpit-stage-header">
            <div>
              <div className="cockpit-stage-title">数据看板</div>
              <div className="cockpit-stage-desc">拖动模块头部移动位置，右下角调整大小</div>
            </div>
            <div className="cockpit-stage-actions">
              <TimeDimensionSelector />
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} className="cockpit-reset-btn">重置布局</Button>
            </div>
          </div>

          <div ref={containerRef} className="cockpit-stage-canvas">
            <StyleLinkLines />
            {!hasPlacedWidgets && (
              <div className="cockpit-stage-empty">
                <div className="cockpit-stage-empty-icon">📊</div>
                <div className="cockpit-stage-empty-title">从左侧拖入模块开始使用</div>
                <div className="cockpit-stage-empty-desc">或点击「重置布局」恢复默认看板</div>
              </div>
            )}
            {(Object.keys(widgets) as (keyof WidgetState)[]).map(key => renderWidget(key))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default CockpitPage;
