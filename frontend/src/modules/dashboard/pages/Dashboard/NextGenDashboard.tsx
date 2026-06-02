import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Row,
  Space,
  Typography,
  Tag,
  Avatar,
  Tooltip,
  Badge,
  Progress,
  List,
  Divider,
  Input
} from 'antd';
import {
  ThunderboltOutlined,
  RobotOutlined,
  PlusOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DollarOutlined,
  RiseOutlined,
  ApartmentOutlined,
  ShoppingCartOutlined,
  FileTextOutlined,
  InboxOutlined,
  ScissorOutlined,
  TeamOutlined,
  BarChartOutlined,
  TagOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import GlobalAiAssistant from '@/components/common/GlobalAiAssistant';
import { useUser } from '@/utils/AuthContext';
import api from '@/utils/api';
import './next-gen-styles.css';

const { Title, Text } = Typography;

// 智能卡片类型定义
interface SmartCard {
  id: string;
  type: 'action' | 'insight' | 'warning' | 'todo';
  priority: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  metadata?: Record<string, any>;
}

// 智能流程向导
interface SmartWizard {
  id: string;
  title: string;
  description: string;
  steps: {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'active' | 'completed';
  }[];
  actionLabel: string;
  onStart: () => void;
}

const NextGenDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useUser();
  const [aiAssistantExpanded, setAiAssistantExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 加载统计数据
  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await api.get('/dashboard/stats');
        setStats(res?.data);
      } catch (e) {
        console.error('加载统计失败:', e);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  // 生成智能卡片（AI驱动的内容推荐）
  const smartCards: SmartCard[] = useMemo(() => [
    {
      id: 'overdue-orders',
      type: 'warning',
      priority: 1,
      title: '3个订单即将逾期',
      description: '订单 PO-2024-00123 距离交货还有2天',
      icon: <WarningOutlined />,
      color: '#faad14',
      action: {
        label: '查看详情',
        onClick: () => navigate('/production')
      }
    },
    {
      id: 'material-alert',
      type: 'warning',
      priority: 2,
      title: '物料库存不足',
      description: '纯棉面料库存仅剩120米',
      icon: <ShoppingCartOutlined />,
      color: '#f5222d',
      action: {
        label: '立即采购',
        onClick: () => navigate('/production/material')
      }
    },
    {
      id: 'approval-pending',
      type: 'todo',
      priority: 3,
      title: '待审批事项',
      description: '2个工资单等待您审批',
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
      action: {
        label: '去审批',
        onClick: () => navigate('/finance/wage-payment')
      }
    },
    {
      id: 'style-insight',
      type: 'insight',
      priority: 4,
      title: 'AI发现',
      description: 'A款在过去30天重复下单率提升23%',
      icon: <RiseOutlined />,
      color: '#1890ff',
      action: {
        label: '查看分析',
        onClick: () => navigate('/cockpit')
      }
    }
  ], [navigate]);

  // 智能流程向导
  const smartWizards: SmartWizard[] = [
    {
      id: 'new-order',
      title: '创建新订单',
      description: '从款式选择到生产下单，3步完成',
      steps: [
        { id: '1', title: '选择款式', description: '从款号库中选择', status: 'pending' },
        { id: '2', title: '配置参数', description: '数量、工厂、交期', status: 'pending' },
        { id: '3', title: '确认下单', description: '检查无误后提交', status: 'pending' }
      ],
      actionLabel: '开始创建',
      onStart: () => navigate('/order-management')
    },
    {
      id: 'material-purchase',
      title: '物料采购',
      description: '智能推荐供应商与价格',
      steps: [
        { id: '1', title: '选择物料', description: '从物料库选择', status: 'pending' },
        { id: '2', title: 'AI推荐', description: '智能匹配供应商', status: 'pending' },
        { id: '3', title: '确认下单', description: '生成采购单', status: 'pending' }
      ],
      actionLabel: '开始采购',
      onStart: () => navigate('/production/material')
    }
  ];

  // 快捷操作
  const quickActions = [
    { icon: <TagOutlined />, label: '新建款式', onClick: () => navigate('/style-info/new'), color: '#1890ff' },
    { icon: <FileTextOutlined />, label: '新建订单', onClick: () => navigate('/order-management'), color: '#52c41a' },
    { icon: <ShoppingCartOutlined />, label: '物料采购', onClick: () => navigate('/production/material'), color: '#fa8c16' },
    { icon: <InboxOutlined />, label: '质检入库', onClick: () => navigate('/production/warehousing'), color: '#722ed1' },
    { icon: <ScissorOutlined />, label: '裁剪管理', onClick: () => navigate('/production/cutting'), color: '#13c2c2' },
    { icon: <ApartmentOutlined />, label: '工厂管理', onClick: () => navigate('/system/factory'), color: '#eb2f96' }
  ];

  // 最近动态（模拟数据）
  const recentActivities = [
    { id: 1, type: 'production', content: '订单 PO-2024-00123 完成裁剪', time: '10:23', icon: <ScissorOutlined /> },
    { id: 2, type: 'scan', content: '工厂A完成 缝纫-1 工序扫码120件', time: '10:15', icon: <InboxOutlined /> },
    { id: 3, type: 'material', content: '纯棉面料入库 500米', time: '09:45', icon: <ShoppingCartOutlined /> },
    { id: 4, type: 'finance', content: '工资单 S2024-005 已审批完成', time: '09:30', icon: <DollarOutlined /> }
  ];

  return (
    <div className="next-gen-dashboard">
      <PageLayout title="智能工作台">
        {/* 顶部欢迎区域 */}
        <div className="dashboard-header">
          <div className="welcome-section">
            <div className="welcome-text">
              <Title level={3} style={{ margin: 0 }}>
                早上好，{user?.name || '用户'}！
              </Title>
              <Text type="secondary">
                今天是{new Date().toLocaleDateString('zh-CN')}，小云AI为您准备了智能工作建议
              </Text>
            </div>
            <div className="quick-search">
              <Input
                prefix={<SearchOutlined />}
                placeholder="用自然语言搜索，比如：找一下A款的订单..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onPressEnter={() => {
                  if (searchQuery.trim()) {
                    setAiAssistantExpanded(true);
                    message.info('小云正在处理您的搜索...');
                  }
                }}
                style={{ width: 400 }}
              />
            </div>
          </div>
        </div>

        <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
          {/* 左侧主内容区 */}
          <Col xs={24} lg={aiAssistantExpanded ? 16 : 20}>
            {/* 快捷操作区 */}
            <Card className="quick-actions-card" size="small">
              <div className="quick-actions-grid">
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    className="quick-action-btn"
                    onClick={action.onClick}
                  >
                    <div className="action-icon" style={{ color: action.color }}>
                      {action.icon}
                    </div>
                    <span className="action-label">{action.label}</span>
                  </button>
                ))}
                <button className="quick-action-btn more-btn">
                  <div className="action-icon">
                    <PlusOutlined />
                  </div>
                  <span className="action-label">更多</span>
                </button>
              </div>
            </Card>

            {/* 统计概览 */}
            <Card className="stats-card" size="small" style={{ marginTop: 16 }}>
              <Row gutter={24}>
                <Col span={6}>
                  <div className="stat-item">
                    <div className="stat-icon" style={{ background: '#e6f7ff', color: '#1890ff' }}>
                      <FileTextOutlined />
                    </div>
                    <div className="stat-content">
                      <div className="stat-value">{stats?.orderCount || 0}</div>
                      <div className="stat-label">进行中订单</div>
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="stat-item">
                    <div className="stat-icon" style={{ background: '#f6ffed', color: '#52c41a' }}>
                      <InboxOutlined />
                    </div>
                    <div className="stat-content">
                      <div className="stat-value">{stats?.todayScan || 0}</div>
                      <div className="stat-label">今日扫码</div>
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="stat-item">
                    <div className="stat-icon" style={{ background: '#fff7e6', color: '#fa8c16' }}>
                      <ShoppingCartOutlined />
                    </div>
                    <div className="stat-content">
                      <div className="stat-value">{stats?.pendingPurchase || 0}</div>
                      <div className="stat-label">待采购</div>
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="stat-item">
                    <div className="stat-icon" style={{ background: '#f9f0ff', color: '#722ed1' }}>
                      <DollarOutlined />
                    </div>
                    <div className="stat-content">
                      <div className="stat-value">¥{stats?.monthRevenue?.toLocaleString() || 0}</div>
                      <div className="stat-label">本月营收</div>
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>

            {/* 智能卡片区域 */}
            <div className="smart-cards-section" style={{ marginTop: 16 }}>
              <div className="section-header">
                <Title level={4} style={{ margin: 0 }}>
                  <ThunderboltOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                  小云智能提醒
                </Title>
              </div>
              <Row gutter={[16, 16]}>
                {smartCards.map((card) => (
                  <Col xs={24} sm={12} lg={12} key={card.id}>
                    <Card
                      className="smart-card"
                      style={{
                        borderLeft: `4px solid ${card.color}`,
                        background: card.type === 'warning' ? '#fffbf0' : '#fff'
                      }}
                      hoverable
                      onClick={card.action?.onClick}
                    >
                      <div className="smart-card-content">
                        <Avatar
                          size={48}
                          style={{ background: `${card.color}15`, color: card.color }}
                          icon={card.icon}
                        />
                        <div className="smart-card-text">
                          <div className="smart-card-title">{card.title}</div>
                          <div className="smart-card-desc">{card.description}</div>
                        </div>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>

            {/* 智能流程向导 */}
            <div className="wizards-section" style={{ marginTop: 16 }}>
              <div className="section-header">
                <Title level={4} style={{ margin: 0 }}>
                  <RobotOutlined style={{ color: '#722ed1', marginRight: 8 }} />
                  智能流程向导
                </Title>
                <Text type="secondary">点击开始，小云引导您一步完成</Text>
              </div>
              <Row gutter={[16, 16]}>
                {smartWizards.map((wizard) => (
                  <Col xs={24} md={12} key={wizard.id}>
                    <Card className="wizard-card" hoverable>
                      <div className="wizard-header">
                        <div>
                          <div className="wizard-title">{wizard.title}</div>
                          <div className="wizard-desc">{wizard.description}</div>
                        </div>
                        <Button
                          type="primary"
                          ghost
                          onClick={wizard.onStart}
                        >
                          {wizard.actionLabel}
                        </Button>
                      </div>
                      <div className="wizard-steps">
                        {wizard.steps.map((step, idx) => (
                          <div key={step.id} className="wizard-step">
                            <div className={`step-dot ${step.status}`} />
                            <div className="step-text">
                              <div className="step-title">{step.title}</div>
                              <div className="step-desc">{step.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          </Col>

          {/* 右侧栏 */}
          <Col xs={24} lg={aiAssistantExpanded ? 8 : 4}>
            {/* 小云AI始终在右侧 */}
            <Card
              className="ai-assistant-panel"
              size="small"
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RobotOutlined style={{ color: '#1890ff' }} />
                  <span>小云AI助手</span>
                  <Tag color="green" style={{ marginLeft: 'auto' }}>在线</Tag>
                </div>
              }
              extra={
                <Button
                  type="text"
                  size="small"
                  onClick={() => setAiAssistantExpanded(!aiAssistantExpanded)}
                >
                  {aiAssistantExpanded ? '收起' : '展开'}
                </Button>
              }
            >
              {aiAssistantExpanded ? (
                <div style={{ height: 500 }}>
                  <GlobalAiAssistant />
                </div>
              ) : (
                <div className="ai-collapsed">
                  <Button
                    type="primary"
                    shape="circle"
                    size="large"
                    icon={<RobotOutlined />}
                    onClick={() => setAiAssistantExpanded(true)}
                  />
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    点击与小云对话
                  </div>
                </div>
              )}
            </Card>

            {/* 最近动态 */}
            {aiAssistantExpanded && (
              <Card
                className="activities-card"
                size="small"
                title="最近动态"
                style={{ marginTop: 16 }}
              >
                <List
                  dataSource={recentActivities}
                  renderItem={(item) => (
                    <List.Item className="activity-item-mini">
                      <div className="mini-icon" style={{ background: '#f0f0f0', borderRadius: 4, padding: 6 }}>
                        {item.icon}
                      </div>
                      <div className="mini-content">
                        <div className="mini-text">{item.content}</div>
                        <div className="mini-time">{item.time}</div>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            )}
          </Col>
        </Row>
      </PageLayout>
    </div>
  );
};

export default NextGenDashboard;
