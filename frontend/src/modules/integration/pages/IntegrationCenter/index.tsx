import React, { useState } from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, CreditCardOutlined, CarOutlined, BellOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ChannelStatusTab from './ChannelStatusTab';
import PaymentRecordsTab from './PaymentRecordsTab';
import LogisticsRecordsTab from './LogisticsRecordsTab';
import CallbackLogsTab from './CallbackLogsTab';

/**
 * 集成对接中心
 *
 * 面板入口，包含4个 Tab：
 * - 渠道状态：查看支付/物流渠道是否已接入
 * - 支付流水：查看所有支付记录
 * - 物流运单：查看所有物流记录
 * - 回调日志：查看第三方推送原始报文
 */
const IntegrationCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState('channel-status');

  const tabs = [
    {
      key: 'channel-status',
      label: (
        <span>
          <ApiOutlined />
          渠道状态
        </span>
      ),
      children: <ChannelStatusTab active={activeTab === 'channel-status'} />,
    },
    {
      key: 'payment-records',
      label: (
        <span>
          <CreditCardOutlined />
          支付流水
        </span>
      ),
      children: <PaymentRecordsTab active={activeTab === 'payment-records'} />,
    },
    {
      key: 'logistics-records',
      label: (
        <span>
          <CarOutlined />
          物流运单
        </span>
      ),
      children: <LogisticsRecordsTab active={activeTab === 'logistics-records'} />,
    },
    {
      key: 'callback-logs',
      label: (
        <span>
          <BellOutlined />
          回调日志
        </span>
      ),
      children: <CallbackLogsTab active={activeTab === 'callback-logs'} />,
    },
  ];

  return (
    <Layout title="集成对接中心">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabs}
        style={{ background: '#fff', padding: '0 16px', borderRadius: 8 }}
      />
    </Layout>
  );
};

export default IntegrationCenter;
