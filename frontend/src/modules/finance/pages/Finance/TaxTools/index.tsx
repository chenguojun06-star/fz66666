import React, { useState } from 'react';
import { Tabs, Typography, Space } from 'antd';
import { DollarOutlined, AuditOutlined, ShoppingOutlined, BarChartOutlined, AppstoreOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import ExpenseTab from './components/ExpenseTab';
import AdvanceTab from './components/AdvanceTab';
import EcRevenueTab from './components/EcRevenueTab';
import WasteTab from './components/WasteTab';

const { Title, Text } = Typography;

const TaxTools: React.FC = () => {
  const [activeTab, setActiveTab] = useState('expense');

  const tabItems = [
    { key: 'expense', label: <span><AuditOutlined />费用报销</span>, children: <ExpenseTab /> },
    { key: 'advance', label: <span><DollarOutlined />员工借支</span>, children: <AdvanceTab /> },
    { key: 'other', label: <span><AppstoreOutlined />其他费用</span>, children: <ExpenseTab defaultExpenseType="other" createButtonText="新建其他费用" /> },
    { key: 'ec', label: <span><ShoppingOutlined />EC收入</span>, children: <EcRevenueTab /> },
    { key: 'waste', label: <span><BarChartOutlined />损耗分析</span>, children: <WasteTab /> },
  ];

  return (
    <PageLayout>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>财税工具</Title>
          <Text type="secondary">费用报销、员工借支、其他费用、EC收入、损耗分析 · 统一入口</Text>
        </div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Space>
    </PageLayout>
  );
};

export default TaxTools;