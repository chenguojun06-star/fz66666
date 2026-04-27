import React from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, DashboardOutlined, BookOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import IntegrationGuideTab from './IntegrationGuideTab';
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
          {
            key: 'guide',
            label: <span><BookOutlined /> 使用教程</span>,
            children: <IntegrationGuideTab />,
          },
        ]}
      />
    </>
  );
};

export default TenantManagement;
