import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, Badge } from 'antd';
import { CrownOutlined, TeamOutlined, DollarOutlined, MessageOutlined, DashboardOutlined, ShoppingCartOutlined, BugOutlined, NotificationOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { appStoreService } from '@/services/system/appStore';
import feedbackService from '@/services/feedbackService';
import AppOrderTab from './AppOrderTab';
import SystemIssueBoard from '../SystemIssueBoard';
import TenantListTab from './components/TenantListTab';
import RegistrationTab from './components/RegistrationTab';
import BillingTab from './components/BillingTab';
import FeedbackTab from './components/FeedbackTab';
import SystemStatusTab from './components/SystemStatusTab';
import BroadcastTab from './components/BroadcastTab';

const CustomerManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'tenants';
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPendingOrderCount = useCallback(async () => {
    try {
      const res: any = await appStoreService.adminOrderList({ status: 'PENDING' });
      const list = res?.data || res || [];
      setPendingOrderCount(Array.isArray(list) ? list.length : 0);
    } catch { /* ignore */ }
  }, []);

  const fetchPendingFeedbackCount = useCallback(async () => {
    try {
      const res: any = await feedbackService.stats();
      const d = res?.data || res;
      setPendingFeedbackCount((d?.pending ?? 0) + (d?.processing ?? 0));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPendingOrderCount();
    fetchPendingFeedbackCount();
    pollTimerRef.current = setInterval(() => {
      fetchPendingOrderCount();
      fetchPendingFeedbackCount();
    }, 60000);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchPendingOrderCount, fetchPendingFeedbackCount]);

  const handleTabChange = useCallback((key: string) => {
    setSearchParams({ tab: key });
    if (key === 'app-orders') setPendingOrderCount(0);
    if (key === 'feedback') setPendingFeedbackCount(0);
  }, [setSearchParams]);

  return (
    <Layout>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'tenants',
            label: <span><CrownOutlined /> 客户管理</span>,
            children: <TenantListTab />,
          },
          {
            key: 'registrations',
            label: <span><TeamOutlined /> 注册审批</span>,
            children: <RegistrationTab />,
          },
          {
            key: 'billing',
            label: <span><DollarOutlined /> 套餐与收费</span>,
            children: <BillingTab />,
          },
          {
            key: 'app-orders',
            label: (
              <span>
                <ShoppingCartOutlined /> 应用订单
                {pendingOrderCount > 0 && <Badge count={pendingOrderCount} style={{ marginLeft: 6 }} size='small' />}
              </span>
            ),
            children: <AppOrderTab onOrderActivated={fetchPendingOrderCount} />,
          },
          {
            key: 'feedback',
            label: (
              <span>
                <MessageOutlined /> 问题反馈
                {pendingFeedbackCount > 0 && <Badge count={pendingFeedbackCount} style={{ marginLeft: 6 }} size='small' />}
              </span>
            ),
            children: <FeedbackTab />,
          },
          {
            key: 'system-status',
            label: <span><DashboardOutlined /> 系统运维</span>,
            children: <SystemStatusTab />,
          },
          {
            key: 'system-issues',
            label: <span><BugOutlined /> 系统看板</span>,
            children: <SystemIssueBoard />,
          },
          {
            key: 'broadcast',
            label: <span><NotificationOutlined /> 全局公告</span>,
            children: <BroadcastTab />,
          },
        ]}
      />
    </Layout>
  );
};

export default CustomerManagement;
