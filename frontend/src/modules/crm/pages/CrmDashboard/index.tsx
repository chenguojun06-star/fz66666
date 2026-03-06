import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Typography, Tag, Spin, Alert } from 'antd';
import { LockOutlined, RocketOutlined, ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { paths } from '@/routeConfig';
import { appStoreService } from '@/services/system/appStore';
import { useAuth } from '@/utils/AuthContext';

const { Title, Text, Paragraph } = Typography;

const FEATURES = [
  { icon: '👥', title: '客户档案管理', desc: '统一管理B端客户信息、联系人、合作历史' },
  { icon: '💳', title: '应收账款追踪', desc: '发货即自动生成应收单，逾期自动提醒催款' },
  { icon: '📱', title: '客户查询门户', desc: '生成专属二维码，客户扫码即可查看订单进度' },
  { icon: '📊', title: '历史订单汇总', desc: '按客户维度查看所有合作款式、金额、周期' },
  { icon: '🔔', title: '出货提醒', desc: '出货前3天自动微信提醒对接人，降低漏货风险' },
  { icon: '📋', title: '报价单生成', desc: '一键生成带款式图、价格、工艺描述的PDF报价单' },
];

const CrmDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) { setSubscribed(true); setChecking(false); return; }
    appStoreService.getMyApps().then(apps => {
      const active = apps.some((a: any) => a.appCode === 'CRM_MODULE' && !a.isExpired);
      setSubscribed(active);
    }).catch(() => { }).finally(() => setChecking(false));
  }, [isSuperAdmin]);

  return (
    <Layout>
      <div style={{ padding: '24px', maxWidth: 960 }}>
        {checking ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
        ) : (
          <>
            {/* 头部状态卡片 */}
            <Card
              style={{
                background: subscribed
                  ? 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                marginBottom: 24,
              }}
              bodyStyle={{ padding: '32px 40px' }}
            >
              <Row align="middle" gutter={24}>
                <Col flex="auto">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    {subscribed
                      ? <CheckCircleOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.9)' }} />
                      : <LockOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)' }} />
                    }
                    <Tag color={subscribed ? 'green' : 'gold'} style={{ fontWeight: 600 }}>
                      {subscribed ? '✅ 已开通' : '付费模块 · ¥599/月'}
                    </Tag>
                  </div>
                  <Title level={3} style={{ color: '#fff', margin: '0 0 8px' }}>
                    客户管理 CRM
                  </Title>
                  <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>
                    {subscribed
                      ? '您已开通 CRM 客户管理模块，功能持续完善中，正式版即将上线，届时可让 B 端客户实时追踪订单进度。'
                      : '深度整合您的生产数据，让每位B端客户都能实时追踪到自己的订单进度。低价对标鼎普 CRM（¥3000+/月），专为中小服装工厂设计。'
                    }
                  </Paragraph>
                </Col>
                {!subscribed && (
                  <Col>
                    <Button
                      type="primary"
                      size="large"
                      icon={<RocketOutlined />}
                      style={{
                        background: '#fff',
                        color: '#764ba2',
                        border: 'none',
                        fontWeight: 600,
                        height: 44,
                        padding: '0 28px',
                      }}
                      onClick={() => navigate(paths.appStore)}
                    >
                      立即开通 <ArrowRightOutlined />
                    </Button>
                  </Col>
                )}
              </Row>
            </Card>

            {subscribed && (
              <Alert
                type="info"
                showIcon
                message="功能开发进度"
                description="客户档案管理、应收款追踪、客户查询门户等功能正在开发中，预计下一个版本上线。感谢您的支持！"
                style={{ marginBottom: 24 }}
              />
            )}

            {/* 功能介绍 */}
            <Title level={5} style={{ marginBottom: 16 }}>
              {subscribed ? '即将上线的功能' : '开通后解锁以下功能'}
            </Title>
            <Row gutter={[16, 16]}>
              {FEATURES.map(f => (
                <Col span={8} key={f.title}>
                  <Card
                    size="small"
                    style={{ height: '100%', filter: subscribed ? 'none' : 'grayscale(30%)', opacity: subscribed ? 1 : 0.85 }}
                    hoverable={false}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 28, lineHeight: 1 }}>{f.icon}</span>
                      <div>
                        <Text strong>{f.title}</Text>
                        <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 12 }}>
                          {f.desc}
                        </Paragraph>
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* 对比说明（仅未开通时显示） */}
            {!subscribed && (
              <Card style={{ marginTop: 24, background: '#f8f9fa' }} bordered={false}>
                <Row gutter={24} align="middle">
                  <Col span={16}>
                    <Text strong>为什么比鼎普便宜5倍？</Text>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
                      鼎普 CRM 模块定价 ¥3000+/月，功能复杂适合大企业。本模块专注中小服装工厂核心需求：
                      应收款追踪 + 客户门户查单，去掉80%用不上的功能，降到 ¥599/月，
                      90天回本，开通当月即可用起来。
                    </Paragraph>
                  </Col>
                  <Col span={8} style={{ textAlign: 'center' }}>
                    <Button
                      type="primary"
                      size="large"
                      onClick={() => navigate(paths.appStore)}
                      style={{ width: '100%' }}
                    >
                      前往应用商店开通
                    </Button>
                  </Col>
                </Row>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default CrmDashboard;
