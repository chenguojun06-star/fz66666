import React, { useState } from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, ShopOutlined, AuditOutlined, DollarOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import FinishedSettlementContent from './FinishedSettlementContent';
import ShipmentReconContent from './ShipmentReconContent';
import PaidUnsettledContent from './PaidUnsettledContent';
import PaidSettledContent from './PaidSettledContent';
import styles from './index.module.css';

type TabKey = 'reconciliation' | 'settlement' | 'unpaid' | 'paid';

const FinanceCenter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 参数读取初始 Tab，默认 reconciliation
  const getInitialTab = (): TabKey => {
    const tab = searchParams.get('tab');
    if (tab === 'reconciliation' || tab === 'settlement' || tab === 'unpaid' || tab === 'paid') {
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
      key: 'reconciliation',
      label: (
        <span className={styles.tabLabel}>
          <FileTextOutlined />
          对账单
        </span>
      ),
      children: <ShipmentReconContent />,
    },
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
    <>
      <div className={styles.container}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          className={styles.tabs}
          size="large"
        />
      </div>
    </>
  );
};

export default FinanceCenter;
