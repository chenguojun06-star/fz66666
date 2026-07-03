import React from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, DashboardOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import IntegrationOverviewTab from './components/IntegrationOverviewTab';
import AppManagementTab from './components/AppManagementTab';

const TenantManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
        items={[
          {
            key: 'overview',
            label: <span><DashboardOutlined /> 集成总览</span>,
            children: <IntegrationOverviewTab />,
          },
          {
            key: 'apps',
            label: <span><ApiOutlined /> 应用管理</span>,
            children: <AppManagementTab />,
          },
        ]}
      />
    </>
  );
};

export default TenantManagement;
