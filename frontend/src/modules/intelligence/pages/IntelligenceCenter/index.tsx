import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import {
  ThunderboltOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import BottleneckPanel from './panels/BottleneckPanel';
import DeliveryRiskPanel from './panels/DeliveryRiskPanel';
import AnomalyPanel from './panels/AnomalyPanel';
import SmartAssignmentPanel from './panels/SmartAssignmentPanel';
import LearningReportPanel from './panels/LearningReportPanel';
import './styles.css';

const { Title } = Typography;

const IntelligenceCenter: React.FC = () => {
  const [activeKey, setActiveKey] = useState('bottleneck');

  const tabItems = [
    {
      key: 'bottleneck',
      label: <span><ThunderboltOutlined /> 瓶颈检测</span>,
      children: <BottleneckPanel />,
    },
    {
      key: 'delivery-risk',
      label: <span><ClockCircleOutlined /> 交期预警</span>,
      children: <DeliveryRiskPanel />,
    },
    {
      key: 'anomaly',
      label: <span><AlertOutlined /> 异常检测</span>,
      children: <AnomalyPanel />,
    },
    {
      key: 'assignment',
      label: <span><TeamOutlined /> 智能派工</span>,
      children: <SmartAssignmentPanel />,
    },
    {
      key: 'learning',
      label: <span><LineChartOutlined /> AI 学习</span>,
      children: <LearningReportPanel />,
    },
  ];

  return (
    <div className="intelligence-center">
      <div className="intelligence-header">
        <Title level={4} style={{ margin: 0 }}>
          <ThunderboltOutlined style={{ marginRight: 8 }} />
          智能运营中心
        </Title>
        <span className="intelligence-subtitle">AI 驱动的生产决策引擎</span>
      </div>
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        items={tabItems}
        size="large"
        style={{ marginTop: 16 }}
      />
    </div>
  );
};

export default IntelligenceCenter;
