import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import {
  ThunderboltOutlined,
  DashboardOutlined,
  DollarOutlined,
  TrophyOutlined,
  ExperimentOutlined,
  SafetyOutlined,
  RobotOutlined,
  HeartOutlined,
  BulbOutlined,
  AlertOutlined,
  CalendarOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import Layout from '@/components/Layout';
import ProductionMonitorPanel from './panels/ProductionMonitorPanel';
import ProfitEstimationPanel from './panels/ProfitEstimationPanel';
import FactoryLeaderboardPanel from './panels/FactoryLeaderboardPanel';
import RhythmDnaPanel from './panels/RhythmDnaPanel';
import SelfHealingPanel from './panels/SelfHealingPanel';
import NlQueryPanel from './panels/NlQueryPanel';
import HealthIndexPanel from './panels/HealthIndexPanel';
import OrderSmartAnalysisPanel from './panels/OrderSmartAnalysisPanel';
import MaterialShortagePanel from './panels/MaterialShortagePanel';
import SchedulingSuggestionPanel from './panels/SchedulingSuggestionPanel';
import LearningReportPanel from './panels/LearningReportPanel';
import './styles.css';

const { Title } = Typography;

const IntelligenceCenter: React.FC = () => {
  const [activeKey, setActiveKey] = useState('production-monitor');

  const tabItems = [
    {
      key: 'material-shortage',
      label: <span><AlertOutlined /> 面料缺口预警</span>,
      children: <MaterialShortagePanel />,
    },
    {
      key: 'production-monitor',
      label: <span><DashboardOutlined /> 生产监控总览</span>,
      children: <ProductionMonitorPanel />,
    },
    {
      key: 'order-smart-analysis',
      label: <span><BulbOutlined /> 订单智能分析</span>,
      children: <OrderSmartAnalysisPanel />,
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
      key: 'scheduling-suggestion',
      label: <span><CalendarOutlined /> 智能排产</span>,
      children: <SchedulingSuggestionPanel />,
    },
    {
      key: 'learning-report',
      label: <span><BarChartOutlined /> AI学习报告</span>,
      children: <LearningReportPanel />,
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
