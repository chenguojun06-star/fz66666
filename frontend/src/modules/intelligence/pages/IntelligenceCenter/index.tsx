import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import {
  ThunderboltOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  DashboardOutlined,
  UserOutlined,
  CalendarOutlined,
  DollarOutlined,
  TrophyOutlined,
  ExperimentOutlined,
  SafetyOutlined,
  BellOutlined,
  RobotOutlined,
  HeartOutlined,
  FireOutlined,
} from '@ant-design/icons';
import Layout from '@/components/Layout';
import BottleneckPanel from './panels/BottleneckPanel';
import DeliveryRiskPanel from './panels/DeliveryRiskPanel';
import AnomalyPanel from './panels/AnomalyPanel';
import SmartAssignmentPanel from './panels/SmartAssignmentPanel';
import LivePulsePanel from './panels/LivePulsePanel';
import WorkerEfficiencyPanel from './panels/WorkerEfficiencyPanel';
import DeliveryPredictionPanel from './panels/DeliveryPredictionPanel';
import ProfitEstimationPanel from './panels/ProfitEstimationPanel';
import FactoryLeaderboardPanel from './panels/FactoryLeaderboardPanel';
import RhythmDnaPanel from './panels/RhythmDnaPanel';
import SelfHealingPanel from './panels/SelfHealingPanel';
import SmartNotificationPanel from './panels/SmartNotificationPanel';
import NlQueryPanel from './panels/NlQueryPanel';
import HealthIndexPanel from './panels/HealthIndexPanel';
import DefectHeatmapPanel from './panels/DefectHeatmapPanel';
import './styles.css';

const { Title } = Typography;

const IntelligenceCenter: React.FC = () => {
  const [activeKey, setActiveKey] = useState('live-pulse');

  const tabItems = [
    {
      key: 'live-pulse',
      label: <span><DashboardOutlined /> 实时脉搏</span>,
      children: <LivePulsePanel />,
    },
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
      key: 'worker-efficiency',
      label: <span><UserOutlined /> 工人效率</span>,
      children: <WorkerEfficiencyPanel />,
    },
    {
      key: 'delivery-prediction',
      label: <span><CalendarOutlined /> 完工预测</span>,
      children: <DeliveryPredictionPanel />,
    },
    {
      key: 'profit-estimation',
      label: <span><DollarOutlined /> 利润预估</span>,
      children: <ProfitEstimationPanel />,
    },
    {
      key: 'factory-leaderboard',
      label: <span><TrophyOutlined /> 工厂排行与排产</span>,
      children: <FactoryLeaderboardPanel />,
    },
    {
      key: 'rhythm-dna',
      label: <span><ExperimentOutlined /> 节奏DNA</span>,
      children: <RhythmDnaPanel />,
    },
    {
      key: 'self-healing',
      label: <span><SafetyOutlined /> 异常自愈</span>,
      children: <SelfHealingPanel />,
    },
    {
      key: 'smart-notification',
      label: <span><BellOutlined /> 智能提醒</span>,
      children: <SmartNotificationPanel />,
    },
    {
      key: 'nl-query',
      label: <span><RobotOutlined /> AI助手与学习</span>,
      children: <NlQueryPanel />,
    },
    {
      key: 'health-index',
      label: <span><HeartOutlined /> 健康指数</span>,
      children: <HealthIndexPanel />,
    },
    {
      key: 'defect-heatmap',
      label: <span><FireOutlined /> 缺陷热力图</span>,
      children: <DefectHeatmapPanel />,
    },
  ];

  return (
    <Layout>
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
    </Layout>
  );
};

export default IntelligenceCenter;
