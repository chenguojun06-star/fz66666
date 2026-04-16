import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { TimeDimensionProvider } from './contexts/TimeDimensionContext';
import { StyleLinkProvider } from './contexts/StyleLinkContext';
import TimeDimensionSelector from './components/TimeDimensionSelector';
import StyleLinkLines from './components/StyleLinkLines';
import OverviewCard from './cards/OverviewCard';
import OrderCard from './cards/OrderCard';
import SampleCard from './cards/SampleCard';
import ProductionCard from './cards/ProductionCard';
import ProcurementCard from './cards/ProcurementCard';
import WarehouseCard from './cards/WarehouseCard';
import './styles.css';

const STORAGE_KEY = 'cockpit-widgets';

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
}

const DEFAULT_POSITION: WidgetPosition = { x: 20, y: 20, width: 520, height: 560 };

const DEFAULT_WIDGETS: WidgetState = {
  overview: { placed: false, ...DEFAULT_POSITION, x: 20 },
  order: { placed: false, ...DEFAULT_POSITION, x: 560, y: 20 },
  sample: { placed: false, ...DEFAULT_POSITION, x: 20, y: 600 },
  production: { placed: false, ...DEFAULT_POSITION, x: 560, y: 600 },
  procurement: { placed: false, ...DEFAULT_POSITION, x: 1100, y: 600 },
  warehouse: { placed: false, ...DEFAULT_POSITION, x: 20, y: 1200 },
};

const loadWidgetState = (): WidgetState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_WIDGETS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_WIDGETS;
};

const MODULES = [
  { key: 'overview' as const, name: '业务概览', desc: '下单 / 生产 / 入库' },
  { key: 'order' as const, name: '下单管理', desc: '待下单 / 生产中 / 已完成' },
  { key: 'sample' as const, name: '样衣开发', desc: '纸样 / 样衣 / BOM' },
  { key: 'production' as const, name: '大货生产', desc: '裁剪 / 车缝 / 尾部' },
  { key: 'procurement' as const, name: '物料采购', desc: '面料 / 里料 / 辅料' },
  { key: 'warehouse' as const, name: '成品仓库', desc: '入库 / 出库 / 库存' },
];

const CARD_MAP = {
  overview: OverviewCard,
  order: OrderCard,
  sample: SampleCard,
  production: ProductionCard,
  procurement: ProcurementCard,
  warehouse: WarehouseCard,
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
    } catch {
      // ignore
    }
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
    setWidgets(prev => ({ ...prev, [key]: { ...prev[key], placed: false } }));
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
      const { key, startWidgetX, startWidgetY, startWidth, startHeight, mode } = dragRef.current;
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

  const hasPlacedWidgets = useMemo(
    () => widgets.overview.placed || widgets.order.placed || widgets.sample.placed || widgets.production.placed || widgets.procurement.placed || widgets.warehouse.placed,
    [widgets]
  );

  return (
    <Layout>
      <TimeDimensionProvider>
        <StyleLinkProvider>
          <div className="cockpit-workbench">
            {/* 左侧模块面板 */}
            <aside className="cockpit-panel">
              <div className="cockpit-panel-header">
                <div className="cockpit-panel-title">模块列表</div>
                <div className="cockpit-panel-hint">拖拽到右侧查看详情</div>
              </div>

              <div className="cockpit-module-list">
                {MODULES.map(m => (
                  <div
                    key={m.key}
                    className={`cockpit-module-item${widgets[m.key].placed ? ' cockpit-module-item--placed' : ''}`}
                    draggable={!widgets[m.key].placed}
                    onDragStart={e => {
                      e.dataTransfer.setData('text/module-key', m.key);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div className="cockpit-module-name">{m.name}</div>
                    <div className="cockpit-module-count">{m.desc}</div>
                  </div>
                ))}
              </div>
            </aside>

            {/* 主工作区 */}
            <main className="cockpit-stage">
              <div className="cockpit-toolbar">
                <div className="cockpit-toolbar-left">
                  <span className="cockpit-toolbar-title">数据看板</span>
                </div>
                <div className="cockpit-toolbar-right">
                  <TimeDimensionSelector />
                  <Button icon={<ReloadOutlined />} onClick={handleRefresh} className="cockpit-reset-btn">重置</Button>
                </div>
              </div>

              <div ref={containerRef} className="cockpit-canvas" onDrop={handleDrop} onDragOver={handleDragOver}>
                <StyleLinkLines />

                {!hasPlacedWidgets && (
                  <div className="cockpit-empty">
                    <div className="cockpit-empty-title">把左侧模块拖进来</div>
                    <div className="cockpit-empty-hint">拖入后可自由拖动位置、调整大小</div>
                  </div>
                )}

                {MODULES.map(m => {
                  if (!widgets[m.key].placed) return null;
                  const w = widgets[m.key];
                  const CardComp = CARD_MAP[m.key];
                  return (
                    <div key={m.key} className="cockpit-widget" style={{ left: w.x, top: w.y, width: w.width, height: w.height }}>
                      <div className="cockpit-widget-header" onMouseDown={e => handleMouseDown(m.key, e, 'move')}>
                        <span className="cockpit-widget-title">{m.name}</span>
                        <Button className="cockpit-widget-close" size="small" onClick={() => handleRemove(m.key)}>×</Button>
                      </div>
                      <div className="cockpit-widget-body">
                        <CardComp key={refreshKey} />
                      </div>
                      <div className="cockpit-widget-resize" onMouseDown={e => handleMouseDown(m.key, e, 'resize')} />
                    </div>
                  );
                })}
              </div>
            </main>
          </div>
        </StyleLinkProvider>
      </TimeDimensionProvider>
    </Layout>
  );
};

export default CockpitPage;
