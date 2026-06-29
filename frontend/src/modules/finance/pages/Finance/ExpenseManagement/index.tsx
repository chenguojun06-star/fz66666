import React, { useState } from 'react';
import { Tabs, Typography, Space } from 'antd';
import { AuditOutlined, DollarOutlined, AppstoreOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import ExpenseTab from '../TaxTools/components/ExpenseTab';
import AdvanceTab from '../TaxTools/components/AdvanceTab';

const { Title, Text } = Typography;

const ExpenseManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('expense');

  const tabItems = [
    { key: 'expense', label: <span><AuditOutlined />费用报销</span>, children: <ExpenseTab /> },
    { key: 'advance', label: <span><DollarOutlined />员工借支</span>, children: <AdvanceTab /> },
    { key: 'other', label: <span><AppstoreOutlined />其他费用</span>, children: <ExpenseTab defaultExpenseType="other" createButtonText="新建其他费用" /> },
  ];

  return (
    <PageLayout>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>费用管理</Title>
          <Text type="secondary">费用报销、员工借支、其他费用</Text>
        </div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Space>
    </PageLayout>
  );
};

export default ExpenseManagement;
