import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
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

const DEFAULT_POSITION: WidgetPosition = {
  x: 20,
  y: 20,
  width: 520,
  height: 560,
};

const DEFAULT_WIDGETS: WidgetState = {
  overview: { placed: false, ...DEFAULT_POSITION, x: 20 },
  order: { placed: false, ...DEFAULT_POSITION, x: 540, y: 20 },
  sample: { placed: false, ...DEFAULT_POSITION, x: 20, y: 600 },
  production: { placed: false, ...DEFAULT_POSITION, x: 540, y: 600 },
  procurement: { placed: false, ...DEFAULT_POSITION, x: 1060, y: 600 },
  warehouse: { placed: false, ...DEFAULT_POSITION, x: 20, y: 1200 },
  insight: { placed: false, ...DEFAULT_POSITION, x: 1060, y: 1200 },
};

const loadWidgetState = (): WidgetState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_WIDGETS, ...parsed };
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
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
          width: DEFAULT_POSITION.width,
          height: DEFAULT_POSITION.height,
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
      const { key, startX, startY, startWidgetX, startWidgetY, startWidth, startHeight, mode } = dragRef.current;
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
    widgets.overview.placed || widgets.order.placed || widgets.sample.placed || widgets.production.placed || widgets.procurement.placed || widgets.warehouse.placed || widgets.insight.placed,
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
}) => {
  const todayStats = useTodayStats();

  return (
    <div className="cockpit-workbench">
          <aside className="cockpit-sidebar">
            <div className="cockpit-sidebar-header">
              <div className="cockpit-sidebar-subtitle">拖拽到右侧区域查看详情</div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'overview');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <OverviewChart key={refreshKey} mode="sidebar" />
              </div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'order');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <OrderPieChart key={refreshKey} mode="sidebar" />
              </div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'sample');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <SamplePieChart key={refreshKey} mode="sidebar" />
              </div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'production');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <ProductionPieChart key={refreshKey} mode="sidebar" />
              </div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'procurement');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <ProcurementPieChart key={refreshKey} mode="sidebar" />
              </div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'warehouse');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <WarehousePieChart key={refreshKey} mode="sidebar" />
              </div>
            </div>

            <div className="cockpit-sidebar-section">
              <div
                className="cockpit-module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/module-key', 'insight');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <InsightCard key={refreshKey} mode="sidebar" />
              </div>
            </div>
          </aside>

          <main className="cockpit-main" onDrop={handleDrop} onDragOver={handleDragOver}>
            <div className="cockpit-stage-header">
              <div>
                <div className="cockpit-stage-title">数据看板</div>
                <div className="cockpit-stage-desc">拖入模块后可自由拖动位置、调整大小</div>
              </div>
              <div className="cockpit-stage-actions">
                <TimeDimensionSelector />
                <Button icon={<ReloadOutlined />} onClick={handleRefresh} className="cockpit-reset-btn">重置</Button>
              </div>
            </div>

            <div ref={containerRef} className="cockpit-stage-canvas">
              <StyleLinkLines />
              {!hasPlacedWidgets && (
                <div className="cockpit-stage-empty">
                  <div className="cockpit-stage-empty-title">把左侧模块拖进来</div>
                  <div className="cockpit-stage-empty-desc">支持业务概览、下单管理、样衣开发、大货生产、物料采购、成品仓库等多个模块，可自由摆放</div>
                </div>
              )}

              {widgets.overview.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.overview.x,
                    top: widgets.overview.y,
                    width: widgets.overview.width,
                    height: widgets.overview.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('overview', e, 'move')}
                  >
                    <span className="cockpit-widget-title">业务概览</span>
                    <span className="cockpit-widget-stats">
                      <span className="cockpit-stat-tag">今日下单 {todayStats.overview.orderQty}件</span>
                      <span className="cockpit-stat-tag cockpit-stat-tag--success">今日入库 {todayStats.overview.inboundQty}件</span>
                      <span className="cockpit-stat-tag cockpit-stat-tag--outbound">今日出库 {todayStats.overview.outboundQty}件</span>
                    </span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('overview')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <OverviewChart
                      key={refreshKey}
                      mode="stage"
                      moduleKey="overview"
                      position={{ x: widgets.overview.x, y: widgets.overview.y, width: widgets.overview.width, height: widgets.overview.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('overview', e, 'resize')}
                  />
                </div>
              )}

              {widgets.order.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.order.x,
                    top: widgets.order.y,
                    width: widgets.order.width,
                    height: widgets.order.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('order', e, 'move')}
                  >
                    <span className="cockpit-widget-title">下单管理</span>
                    <span className="cockpit-widget-stats">
                      <span className="cockpit-stat-tag">今日下单 {todayStats.order.orderQty}件</span>
                    </span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('order')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <OrderPieChart
                      key={refreshKey}
                      mode="stage"
                      moduleKey="order"
                      position={{ x: widgets.order.x, y: widgets.order.y, width: widgets.order.width, height: widgets.order.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('order', e, 'resize')}
                  />
                </div>
              )}

              {widgets.sample.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.sample.x,
                    top: widgets.sample.y,
                    width: widgets.sample.width,
                    height: widgets.sample.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('sample', e, 'move')}
                  >
                    <span className="cockpit-widget-title">样衣开发</span>
                    <span className="cockpit-widget-stats">
                      <span className="cockpit-stat-tag">今日下样 {todayStats.sample.newCount}</span>
                      <span className="cockpit-stat-tag cockpit-stat-tag--success">今日完成 {todayStats.sample.completedCount}</span>
                    </span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('sample')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <SamplePieChart
                      key={refreshKey}
                      mode="stage"
                      moduleKey="sample"
                      position={{ x: widgets.sample.x, y: widgets.sample.y, width: widgets.sample.width, height: widgets.sample.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('sample', e, 'resize')}
                  />
                </div>
              )}

              {widgets.production.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.production.x,
                    top: widgets.production.y,
                    width: widgets.production.width,
                    height: widgets.production.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('production', e, 'move')}
                  >
                    <span className="cockpit-widget-title">大货生产</span>
                    <span className="cockpit-widget-stats">
                      <span className="cockpit-stat-tag cockpit-stat-tag--success">今日完成 {todayStats.production.completedQty}件</span>
                    </span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('production')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <ProductionPieChart
                      key={refreshKey}
                      mode="stage"
                      moduleKey="production"
                      position={{ x: widgets.production.x, y: widgets.production.y, width: widgets.production.width, height: widgets.production.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('production', e, 'resize')}
                  />
                </div>
              )}

              {widgets.procurement.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.procurement.x,
                    top: widgets.procurement.y,
                    width: widgets.procurement.width,
                    height: widgets.procurement.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('procurement', e, 'move')}
                  >
                    <span className="cockpit-widget-title">物料采购</span>
                    <span className="cockpit-widget-stats">
                      <span className="cockpit-stat-tag">今日新增 {todayStats.procurement.newCount}</span>
                      <span className="cockpit-stat-tag cockpit-stat-tag--success">今日完成 {todayStats.procurement.completedCount}</span>
                    </span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('procurement')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <ProcurementPieChart
                      key={refreshKey}
                      mode="stage"
                      moduleKey="procurement"
                      position={{ x: widgets.procurement.x, y: widgets.procurement.y, width: widgets.procurement.width, height: widgets.procurement.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('procurement', e, 'resize')}
                  />
                </div>
              )}

              {widgets.warehouse.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.warehouse.x,
                    top: widgets.warehouse.y,
                    width: widgets.warehouse.width,
                    height: widgets.warehouse.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('warehouse', e, 'move')}
                  >
                    <span className="cockpit-widget-title">成品仓库</span>
                    <span className="cockpit-widget-stats">
                      <span className="cockpit-stat-tag cockpit-stat-tag--success">今日出库 {todayStats.warehouse.outboundQty}件</span>
                    </span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('warehouse')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <WarehousePieChart
                      key={refreshKey}
                      mode="stage"
                      moduleKey="warehouse"
                      position={{ x: widgets.warehouse.x, y: widgets.warehouse.y, width: widgets.warehouse.width, height: widgets.warehouse.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('warehouse', e, 'resize')}
                  />
                </div>
              )}

              {widgets.insight.placed && (
                <div
                  className="cockpit-widget"
                  style={{
                    left: widgets.insight.x,
                    top: widgets.insight.y,
                    width: widgets.insight.width,
                    height: widgets.insight.height,
                  }}
                >
                  <div
                    className="cockpit-widget-header"
                    onMouseDown={(e) => handleMouseDown('insight', e, 'move')}
                  >
                    <span className="cockpit-widget-title">AI 智能洞察</span>
                    <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove('insight')}>×</Button>
                  </div>
                  <div className="cockpit-widget-body">
                    <InsightCard
                      key={refreshKey}
                      mode="stage"
                      moduleKey="insight"
                      position={{ x: widgets.insight.x, y: widgets.insight.y, width: widgets.insight.width, height: widgets.insight.height }}
                    />
                  </div>
                  <div
                    className="cockpit-widget-resize"
                    onMouseDown={(e) => handleMouseDown('insight', e, 'resize')}
                  />
                </div>
              )}
            </div>
          </main>
        </div>
  );
};

export default CockpitPage;
