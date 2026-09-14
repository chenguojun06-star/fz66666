import React from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, DashboardOutlined } from '@ant-design/icons';
import IntegrationOverviewTab from './components/IntegrationOverviewTab';
import AppManagementTab from './components/AppManagementTab';
import { usePersistentTab } from '@/hooks/usePersistentTab';

const TenantManagement: React.FC = () => {
  // 旧写法 setSearchParams({ tab: key }) 会整体替换 query，把其它参数清掉
  const [activeTab, setActiveTab] = usePersistentTab('tab', 'overview');

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
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
