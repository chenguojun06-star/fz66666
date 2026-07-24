import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import { ShopOutlined, AuditOutlined, DollarOutlined, ScanOutlined, BankOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import FinishedSettlementContent from './FinishedSettlementContent';
import ExternalScanContent from './ExternalScanContent';
import FactorySummaryContent from './FactorySummaryContent';
import PaidUnsettledContent from './PaidUnsettledContent';
import PaidSettledContent from './PaidSettledContent';
import styles from './index.module.css';

const { Text } = Typography;

type TabKey = 'settlement' | 'externalScan' | 'factorySummary' | 'unpaid' | 'paid';

const FinanceCenter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 参数读取初始 Tab，默认 settlement
  const getInitialTab = (): TabKey => {
    const tab = searchParams.get('tab');
    if (tab === 'settlement' || tab === 'externalScan' || tab === 'factorySummary' || tab === 'unpaid' || tab === 'paid') {
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
  React.useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 已审核订单号集合：用于外发结算Tab内部状态共享
  const [auditedOrderNos, setAuditedOrderNos] = useState<Set<string>>(new Set());

  const tabItems = [
    {
      key: 'settlement',
      label: (
        <span className={styles.tabLabel}>
          <ShopOutlined />
          外发结算
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
      key: 'externalScan',
      label: (
        <span className={styles.tabLabel}>
          <ScanOutlined />
          外部工厂扫码
        </span>
      ),
      children: <ExternalScanContent />,
    },
    {
      key: 'factorySummary',
      label: (
        <span className={styles.tabLabel}>
          <BankOutlined />
          工厂汇总
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
      key: 'unpaid',
      label: (
        <span className={styles.tabLabel}>
          <AuditOutlined />
          已审未付
        </span>
      ),
      children: <PaidUnsettledContent />,
    },
    {
      key: 'paid',
      label: (
        <span className={styles.tabLabel}>
          <DollarOutlined />
          已付款
        </span>
      ),
      children: <PaidSettledContent />,
    },
  ];

  return (
    <PageLayout
      title="财务中心"
      headerContent={
        <Text type="secondary">外发结算 · 外部工厂扫码 · 工厂汇总 · 已审未付 · 已付款</Text>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        className={styles.tabs}
        size="large"
      />
    </PageLayout>
  );
};

export default FinanceCenter;
