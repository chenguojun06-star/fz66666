import React, { useState, useEffect } from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, LineChartOutlined, ShopOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import FinishedSettlementContent from './FinishedSettlementContent';
import FactorySummaryContent from './FactorySummaryContent';
import DashboardContent from './DashboardContent';
import styles from './index.module.css';

type TabKey = 'settlement' | 'factory' | 'dashboard';

const FinanceCenter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 参数读取初始 Tab，默认 settlement
  const getInitialTab = (): TabKey => {
    const tab = searchParams.get('tab');
    if (tab === 'dashboard' || tab === 'settlement' || tab === 'factory') {
      return tab;
    }
    return 'settlement';
  };

  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);

  // Tab 切换时更新 URL 参数
  const handleTabChange = (key: string) => {
    const tabKey = key as TabKey;
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey }, { replace: true });
  };

  // 初始化时同步 URL
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, []);

  const tabItems = [
    {
      key: 'settlement',
      label: (
        <span className={styles.tabLabel}>
          <FileTextOutlined />
          订单汇总
        </span>
      ),
      children: <FinishedSettlementContent />,
    },
    {
      key: 'factory',
      label: (
        <span className={styles.tabLabel}>
          <ShopOutlined />
          工厂订单汇总
        </span>
      ),
      children: <FactorySummaryContent />,
    },
    {
      key: 'dashboard',
      label: (
        <span className={styles.tabLabel}>
          <LineChartOutlined />
          数据看板
        </span>
      ),
      children: <DashboardContent />,
    },
  ];

  return (
    <Layout>
      <div className={styles.container}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          className={styles.tabs}
          size="large"
        />
      </div>
    </Layout>
  );
};

export default FinanceCenter;
