import React from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, CreditCardOutlined, CarOutlined, BellOutlined, CloudOutlined } from '@ant-design/icons';
import ChannelStatusTab from './ChannelStatusTab';
import PaymentRecordsTab from './PaymentRecordsTab';
import LogisticsRecordsTab from './LogisticsRecordsTab';
import CallbackLogsTab from './CallbackLogsTab';
import PlatformConnectorTab from './PlatformConnectorTab';
import { usePersistentState } from '@/hooks/usePersistentState';

/**
 * 集成对接中心
 *
 * 面板入口，包含5个 Tab：
 * - 渠道状态：查看支付/物流渠道是否已接入
 * - 平台对接：配置聚水潭/东纺/淘宝/抖音等外部平台
 * - 支付流水：查看所有收支记录
 * - 物流运单：查看所有物流记录
 * - 回调日志：查看第三方推送原始报文
 */
const IntegrationCenter: React.FC = () => {
  const [activeTab, setActiveTab] = usePersistentState<string>('integration-center-active-tab', 'platform-connector');

  const tabs = [
    {
      key: 'platform-connector',
      label: (
        <span>
          <CloudOutlined />
          平台对接
        </span>
      ),
      children: <PlatformConnectorTab active={activeTab === 'platform-connector'} />,
    },
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
    <>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabs}
        style={{ background: '#fff', padding: '0 16px', borderRadius: 8 }}
      />
    </>
  );
};

export default IntegrationCenter;
