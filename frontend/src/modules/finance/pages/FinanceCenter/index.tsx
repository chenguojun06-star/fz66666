import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import { ShopOutlined, ScanOutlined, BankOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import { usePersistentTab } from '@/hooks/usePersistentTab';
import FinishedSettlementContent from './FinishedSettlementContent';
import ExternalScanContent from './ExternalScanContent';
import FactorySummaryContent from './FactorySummaryContent';
import styles from './index.module.css';

const { Text } = Typography;

type TabKey = 'settlement' | 'externalScan' | 'factorySummary';

const FinanceCenter: React.FC = () => {
  // Tab 持久化到 URL ?tab=，刷新后不回退到第一个。
  // 用统一 hook 替代原先手写的「读 + setSearchParams({tab})」：
  // 旧写法会整体替换 query，把 URL 上的其它参数一并清掉
  const [activeTab, setActiveTab] = usePersistentTab<TabKey>(
    'tab',
    'settlement',
    ['settlement', 'externalScan', 'factorySummary'],
  );

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
  ];

  return (
    <PageLayout
      title="外发结算"
      headerContent={
        <Text type="secondary">外发结算 · 外部工厂扫码 · 工厂汇总</Text>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        className={styles.tabs}
        size="large"
      />
    </PageLayout>
  );
};

export default FinanceCenter;
