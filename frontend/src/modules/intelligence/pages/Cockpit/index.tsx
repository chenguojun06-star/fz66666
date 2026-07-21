import React from 'react';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { TimeDimensionProvider } from './contexts/TimeDimensionContext';
import { StyleLinkProvider } from './contexts/StyleLinkContext';
import TimeDimensionSelector from './components/TimeDimensionSelector';
import StyleLinkLines from './components/StyleLinkLines';
import OverviewChart from './components/OverviewChart';
import OrderPieChart from './components/OrderPieChart';
import SamplePieChart from './components/SamplePieChart';
import ProductionPieChart from './components/ProductionPieChart';
import ProcurementPieChart from './components/ProcurementPieChart';
import WarehousePieChart from './components/WarehousePieChart';
import SidebarModuleCard from './components/SidebarModuleCard';
import WidgetContainer from './components/WidgetContainer';
import { useCockpitWidgets } from './hooks/useCockpitWidgets';
import { MODULE_TITLES, WidgetKey, WidgetPosition } from './helpers';
import './styles.css';

type ChartComponent = React.FC<{
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: WidgetPosition;
}>;

interface ModuleConfig {
  key: WidgetKey;
  Component: ChartComponent;
}

// 模块配置：定义侧边栏与舞台中渲染的全部模块及其顺序
const MODULES: ModuleConfig[] = [
  { key: 'overview', Component: OverviewChart },
  { key: 'order', Component: OrderPieChart },
  { key: 'sample', Component: SamplePieChart },
  { key: 'production', Component: ProductionPieChart },
  { key: 'procurement', Component: ProcurementPieChart },
  { key: 'warehouse', Component: WarehousePieChart },
];

const CockpitPage: React.FC = () => {
  const {
    widgets,
    refreshKey,
    refreshing,
    containerRef,
    hasPlacedWidgets,
    handleDrop,
    handleDragOver,
    handleRemove,
    handleRefresh,
    handleResetLayout,
    handleMouseDown,
    handleTouchStart,
  } = useCockpitWidgets();

  return (
    <>
      <TimeDimensionProvider>
        <StyleLinkProvider>
          <div className="cockpit-workbench">
          <aside className="cockpit-sidebar">
            <div className="cockpit-sidebar-header">
              <div className="cockpit-sidebar-subtitle">拖拽到右侧区域查看详情</div>
            </div>

            {MODULES.map(({ key, Component }) => (
              <SidebarModuleCard key={key} moduleKey={key}>
                <Component key={refreshKey} mode="sidebar" />
              </SidebarModuleCard>
            ))}
          </aside>

          <main className="cockpit-main" onDrop={handleDrop} onDragOver={handleDragOver}>
            <div className="cockpit-stage-header">
              <div>
                <div className="cockpit-stage-title">数据看板</div>
                <div className="cockpit-stage-desc">实时监控 · 拖入模块后可自由拖动位置、调整大小</div>
              </div>
              <div className="cockpit-stage-actions">
                <TimeDimensionSelector />
                <Tooltip title="刷新数据">
                  <Button icon={<SyncOutlined spin={refreshing} />} onClick={handleRefresh} className="cockpit-reset-btn" />
                </Tooltip>
                <Tooltip title="重置布局">
                  <Button icon={<ReloadOutlined />} onClick={handleResetLayout} className="cockpit-reset-btn" />
                </Tooltip>
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

              {MODULES.map(({ key, Component }) => {
                const widget = widgets[key];
                return (
                  <WidgetContainer
                    key={key}
                    widget={widget}
                    widgetKey={key}
                    title={MODULE_TITLES[key]}
                    onRemove={handleRemove}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                  >
                    <Component
                      key={refreshKey}
                      mode="stage"
                      moduleKey={key}
                      position={{ x: widget.x, y: widget.y, width: widget.width, height: widget.height }}
                    />
                  </WidgetContainer>
                );
              })}
            </div>
          </main>
        </div>
        </StyleLinkProvider>
      </TimeDimensionProvider>
    </>
  );
};

export default CockpitPage;
