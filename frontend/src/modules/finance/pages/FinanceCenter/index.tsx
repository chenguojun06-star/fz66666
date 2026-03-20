import React, { useState, useEffect } from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, LineChartOutlined, ShopOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/utils/AuthContext';
import Layout from '@/components/Layout';
import FinishedSettlementContent from './FinishedSettlementContent';
import FactorySummaryContent from './FactorySummaryContent';
import DashboardContent from './DashboardContent';
import styles from './index.module.css';

type TabKey = 'settlement' | 'factory' | 'dashboard';

const FinanceCenter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isFactoryAccount = !!(user as any)?.factoryId;
  // 已审核订单号集合：Tab1审核后流入Tab2，Tab2驳回后回流Tab1
  const [auditedOrderNos, setAuditedOrderNos] = useState<Set<string>>(new Set());

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

  // 工厂账号不能访问其他 Tab︌强制跳回订单汇总
  useEffect(() => {
    if (isFactoryAccount && activeTab !== 'settlement') {
      setActiveTab('settlement');
      setSearchParams({ tab: 'settlement' }, { replace: true });
    }
  }, [isFactoryAccount]);

  const tabItems = [
    {
      key: 'settlement',
      label: (
        <span className={styles.tabLabel}>
          <FileTextOutlined />
          订单汇总
        </span>
      ),
      children: (
        <FinishedSettlementContent
          auditedOrderNos={auditedOrderNos}
          onAuditNosChange={setAuditedOrderNos}
        />
      ),
    },
    {
      key: 'factory',
      label: (
        <span className={styles.tabLabel}>
          <ShopOutlined />
          工厂订单汇总
        </span>
      ),
      children: (
        <FactorySummaryContent
          auditedOrderNos={auditedOrderNos}
          onAuditNosChange={setAuditedOrderNos}
        />
      ),
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

  const visibleTabItems = isFactoryAccount ? tabItems.slice(0, 1) : tabItems;

  return (
    <Layout>
      <div className={styles.container}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={visibleTabItems}
          className={styles.tabs}
          size="large"
        />
      </div>
    </Layout>
  );
};

export default FinanceCenter;
