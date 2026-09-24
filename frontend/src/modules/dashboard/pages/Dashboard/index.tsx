import React, { useEffect, useState } from 'react';
import { AutoComplete, Button, Space } from 'antd';
import { DownOutlined, UpOutlined, WarningOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import TopStats from '../../components/TopStats';
import DashboardAiInsight from '../../components/DashboardAiInsight';
import StandardToolbar from '@/components/common/StandardToolbar';
import OrderCuttingChart from '../../components/OrderCuttingChart';
import ScanCountChart from '../../components/ScanCountChart';
import OverdueOrderTable from '../../components/OverdueOrderTable';
import DeliveryAlertCard from '../../components/DeliveryAlertCard';
import QualityStatsCard from '../../components/QualityStatsCard';
import ProductionBottleneckCard from '../../components/ProductionBottleneckCard';

import { useDashboardStats } from './useDashboardStats';
import { useDashboardSearch } from './useDashboardSearch';
import { useQuickEntries } from './useQuickEntries';
import RecentActivityCard from './RecentActivityCard';
import HomeQuickGrid from './HomeQuickGrid';
import FlowGuideCard from './FlowGuideCard';
import ServiceSidebar from './ServiceSidebar';
import QuickEntrySettingsModal from './QuickEntrySettingsModal';
import './styles.css';

/** D-526：经营数据区折叠记忆（默认展开，收过一次就记住） */
const DATA_COLLAPSE_KEY = 'dashboard_data_collapsed';

const Dashboard: React.FC = () => {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stats,
    recentActivities,
    hasError,
    errorMessage,
    retryCount,
    handleRetry
  } = useDashboardStats();

  const {
    searchKeyword,
    searchLoading,
    searchOptions,
    handleSearchChange,
    handleSearchSelect,
  } = useDashboardSearch();

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [dataCollapsed, setDataCollapsed] = useState(() => localStorage.getItem(DATA_COLLAPSE_KEY) === '1');

  const {
    quickEntries,
    handleToggleEntry,
    handleSaveSettings,
    handleResetSettings,
  } = useQuickEntries();

  useEffect(() => {
    document.body.classList.add('dashboard-page');
    return () => {
      document.body.classList.remove('dashboard-page');
    };
  }, []);

  const toggleDataSection = () => {
    setDataCollapsed((prev) => {
      localStorage.setItem(DATA_COLLAPSE_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  const handleSaveSettingsAndClose = () => {
    handleSaveSettings(() => setSettingsVisible(false));
  };

  return (
    <>
      <div className="dashboard-container">
        <PageLayout title="仪表盘">

        {hasError && (
          <div className="dashboard-error-alert">
            <div className="dashboard-error-alert-content">
              <WarningOutlined className="dashboard-error-alert-icon" />
              <div>
                <div className="dashboard-error-alert-title">
                  数据加载失败
                </div>
                <div className="dashboard-error-alert-desc">
                  {errorMessage || '无法连接到服务器，请检查网络连接后重试'}
                </div>
              </div>
            </div>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRetry}
              loading={retryCount > 0 && hasError}
            >
              重试 {retryCount > 0 ? `(${retryCount})` : ''}
            </Button>
          </div>
        )}

        <StandardToolbar
          left={(
            <div className="dashboard-search-inline" style={{ width: 'min(420px, 100%)' }}>
              <AutoComplete
                value={searchKeyword}
                options={searchOptions}
                onChange={handleSearchChange}
                onSelect={handleSearchSelect}
                placeholder="搜索订单号/款号/工厂名"
                allowClear
                notFoundContent={searchLoading ? '搜索中...' : null}
                optionRender={(opt: any) => (
                  <div>
                    <div className="u-fw-500">{opt.label}</div>
                    <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>{opt.desc}</div>
                  </div>
                )}
              />
            </div>
          )}
          right={(
            <Space>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
              >
                配置常用功能
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRetry}
                loading={retryCount > 0 && hasError}
              >
                刷新数据
              </Button>
            </Space>
          )}
        />

        {/*
         * D-526 首页聚水潭化：左主栏（常用功能宫格 → 流程引导 → 经营数据）+ 右服务栏。
         * 「先办事、再看数」——宫格提到首屏主视觉，数据区整体下移且可折叠。
         */}
        <div className="home-layout">
          <div className="home-main">
            <HomeQuickGrid
              entries={quickEntries}
              onOpenSettings={() => setSettingsVisible(true)}
            />

            <FlowGuideCard />

            <div className="home-data-section">
              <div className="home-section-header">
                <span className="home-section-title">经营数据</span>
                <Button
                  type="text"
                  size="small"
                  icon={dataCollapsed ? <DownOutlined /> : <UpOutlined />}
                  onClick={toggleDataSection}
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {dataCollapsed ? '展开' : '收起'}
                </Button>
              </div>

              {!dataCollapsed && (
                <>
                  <TopStats />

                  <DashboardAiInsight />

                  <div className="dashboard-insight-grid">
                    <DeliveryAlertCard />
                    <QualityStatsCard />
                    <ProductionBottleneckCard />
                  </div>

                  <div className="dashboard-analysis-section">
                    <OrderCuttingChart />
                    <ScanCountChart />
                  </div>

                  <div className="dashboard-bottom-grid">
                    <OverdueOrderTable />
                    <div className="dashboard-side-stack">
                      <RecentActivityCard activities={recentActivities} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className="home-side">
            <ServiceSidebar />
          </aside>
        </div>
      </PageLayout>

      <QuickEntrySettingsModal
        open={settingsVisible}
        quickEntries={quickEntries}
        onToggle={handleToggleEntry}
        onSave={handleSaveSettingsAndClose}
        onReset={handleResetSettings}
        onCancel={() => setSettingsVisible(false)}
      />
      </div>
    </>
  );
};

export default Dashboard;
