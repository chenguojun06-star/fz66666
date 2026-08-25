import React, { useEffect, useState } from 'react';
import { AutoComplete, Button, Space } from 'antd';
import { WarningOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
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
import QuickEntryCard from './QuickEntryCard';
import QuickEntrySettingsModal from './QuickEntrySettingsModal';
import './styles.css';

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
                    <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{opt.desc}</div>
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
                配置快捷入口
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
            <QuickEntryCard
              entries={quickEntries}
              onOpenSettings={() => setSettingsVisible(true)}
            />
          </div>
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
