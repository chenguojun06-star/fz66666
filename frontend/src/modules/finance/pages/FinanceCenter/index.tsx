import React, { useState, useEffect } from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, LineChartOutlined, ShopOutlined, ScanOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/utils/AuthContext';
import Layout from '@/components/Layout';
import FinishedSettlementContent from './FinishedSettlementContent';
import FactorySummaryContent from './FactorySummaryContent';
import DashboardContent from './DashboardContent';
import ExternalScanContent from './ExternalScanContent';
import styles from './index.module.css';

type TabKey = 'settlement' | 'factory' | 'dashboard' | 'scans';

const FinanceCenter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isFactoryAccount = !!(user as any)?.factoryId;
  // 已审核订单号集合：Tab1审核后流入Tab2，Tab2驳回后回流Tab1
  const [auditedOrderNos, setAuditedOrderNos] = useState<Set<string>>(new Set());

  // 从 URL 参数读取初始 Tab，默认 settlement
  const getInitialTab = (): TabKey => {
    const tab = searchParams.get('tab');
    if (tab === 'dashboard' || tab === 'settlement' || tab === 'factory' || tab === 'scans') {
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

  // 工厂账号只能访问订单汇总和扫码明细
  useEffect(() => {
    if (isFactoryAccount && activeTab !== 'settlement' && activeTab !== 'scans') {
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
    {
      key: 'scans',
      label: (
        <span className={styles.tabLabel}>
          <ScanOutlined />
          扫码明细
        </span>
      ),
      children: <ExternalScanContent />,
    },
  ];

  const visibleTabItems = isFactoryAccount
    ? tabItems.filter((t) => t.key === 'settlement' || t.key === 'scans')
    : tabItems;

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
