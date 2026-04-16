import React from 'react';
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { TimeDimensionProvider } from './contexts/TimeDimensionContext';
import { StyleLinkProvider } from './contexts/StyleLinkContext';
import TimeDimensionSelector from './components/TimeDimensionSelector';
import OverviewChart from './components/OverviewChart';
import OrderPieChart from './components/OrderPieChart';
import SamplePieChart from './components/SamplePieChart';
import ProductionPieChart from './components/ProductionPieChart';
import ProcurementPieChart from './components/ProcurementPieChart';
import WarehousePieChart from './components/WarehousePieChart';
import './styles.css';

const CockpitPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = React.useState(0);

  const handleRefresh = React.useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <Layout>
      <TimeDimensionProvider>
        <StyleLinkProvider>
          <div className="cockpit-workbench">
            <div className="cockpit-toolbar">
              <div className="cockpit-toolbar-left">
                <span className="cockpit-toolbar-title">数据看板</span>
                <span className="cockpit-toolbar-hint">实时业务数据总览</span>
              </div>
              <div className="cockpit-toolbar-right">
                <TimeDimensionSelector />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleRefresh}
                  className="cockpit-reset-btn"
                >
                  刷新
                </Button>
              </div>
            </div>

            <div className="cockpit-content">
              <div className="cockpit-grid">
                <div className="cockpit-card">
                  <div className="cockpit-card-header">
                    <span className="cockpit-card-title">
                      <span className="cockpit-card-dot"></span>
                      业务概览
                    </span>
                  </div>
                  <div className="cockpit-card-body">
                    <OverviewChart key={refreshKey} />
                  </div>
                </div>

                <div className="cockpit-card">
                  <div className="cockpit-card-header">
                    <span className="cockpit-card-title">
                      <span className="cockpit-card-dot"></span>
                      下单管理
                    </span>
                  </div>
                  <div className="cockpit-card-body">
                    <OrderPieChart key={refreshKey} />
                  </div>
                </div>

                <div className="cockpit-card">
                  <div className="cockpit-card-header">
                    <span className="cockpit-card-title">
                      <span className="cockpit-card-dot"></span>
                      样衣开发
                    </span>
                  </div>
                  <div className="cockpit-card-body">
                    <SamplePieChart key={refreshKey} />
                  </div>
                </div>

                <div className="cockpit-card">
                  <div className="cockpit-card-header">
                    <span className="cockpit-card-title">
                      <span className="cockpit-card-dot"></span>
                      大货生产
                    </span>
                  </div>
                  <div className="cockpit-card-body">
                    <ProductionPieChart key={refreshKey} />
                  </div>
                </div>

                <div className="cockpit-card">
                  <div className="cockpit-card-header">
                    <span className="cockpit-card-title">
                      <span className="cockpit-card-dot"></span>
                      物料采购
                    </span>
                  </div>
                  <div className="cockpit-card-body">
                    <ProcurementPieChart key={refreshKey} />
                  </div>
                </div>

                <div className="cockpit-card">
                  <div className="cockpit-card-header">
                    <span className="cockpit-card-title">
                      <span className="cockpit-card-dot"></span>
                      成品仓库
                    </span>
                  </div>
                  <div className="cockpit-card-body">
                    <WarehousePieChart key={refreshKey} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </StyleLinkProvider>
      </TimeDimensionProvider>
    </Layout>
  );
};

export default CockpitPage;
