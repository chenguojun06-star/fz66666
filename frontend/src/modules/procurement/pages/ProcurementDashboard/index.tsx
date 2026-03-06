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
  { icon: '📦', title: '采购订单管理', desc: '对面辅料供应商下单，支持多家比价与历史报价' },
  { icon: '✅', title: '收货确认', desc: '供应商发货后小程序扫码收货，自动入库并更新应付' },
  { icon: '💰', title: '应付账款', desc: '按供应商汇总欠款，到期自动提醒，一键付款确认' },
  { icon: '⚠️', title: '缺料预警', desc: '生产订单用料计划与库存对比，提前7天发出缺料警报' },
  { icon: '🏭', title: '供应商评级', desc: '按交期准时率、质量合格率自动生成黑黄绿供应商评级' },
  { icon: '🔗', title: '仓库联动', desc: '收货入库、退货出库全程自动联动仓库模块，消除手写台账' },
];

const PROCUREMENT_APP_CODE_ALIASES = ['PROCUREMENT', 'SUPPLIER_PROCUREMENT'];

const hasActiveSubscription = (item: any, appCodeAliases: string[]) => {
  const code = String(item?.appCode || '').trim().toUpperCase();
  const match = appCodeAliases.includes(code);
  if (!match) return false;

  const status = String(item?.status || '').trim().toUpperCase();
  const isStatusActive = status === '' || status === 'ACTIVE' || status === 'TRIAL';

  if (item?.isExpired === true) return false;
  const endTime = item?.endTime ? new Date(item.endTime).getTime() : null;
  const notExpired = endTime == null || Number.isNaN(endTime) || endTime > Date.now();

  return isStatusActive && notExpired;
};

const ProcurementDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) { setSubscribed(true); setChecking(false); return; }
    const checkSubscribed = async () => {
      try {
        // 优先使用 my-apps（包含开通信息 + 兼容字段）
        const apps = await appStoreService.getMyApps();
        const activeFromApps = (Array.isArray(apps) ? apps : []).some((a: any) =>
          hasActiveSubscription(a, PROCUREMENT_APP_CODE_ALIASES)
        );
        if (activeFromApps) {
          setSubscribed(true);
          return;
        }

        // 回退到 my-subscriptions，避免 my-apps 某些环境下误判
        const subscriptions = await appStoreService.getMySubscriptions();
        const activeFromSubs = (Array.isArray(subscriptions) ? subscriptions : []).some((s: any) =>
          hasActiveSubscription(s, PROCUREMENT_APP_CODE_ALIASES)
        );
        setSubscribed(activeFromSubs);
      } catch {
        setSubscribed(false);
      } finally {
        setChecking(false);
      }
    };

    checkSubscribed();
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
                  : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
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
                    供应商采购管理
                  </Title>
                  <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>
                    {subscribed
                      ? '您已开通供应商采购管理模块，功能持续完善中，正式版即将上线，届时全流程采购数字化将自动与仓库模块打通。'
                      : '将面辅料采购流程完全数字化：下单→收货→入库→付款，打通仓库模块，替代手写台账与微信截图催货。'
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
                        color: '#11998e',
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
                description="采购订单管理、收货确认、应付账款、缺料预警等功能正在开发中，预计下一个版本上线。感谢您的支持！"
                style={{ marginBottom: 24 }}
              />
            )}

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

            {!subscribed && (
              <Card style={{ marginTop: 24, background: '#f8f9fa' }} bordered={false}>
                <Row gutter={24} align="middle">
                  <Col span={16}>
                    <Text strong>采购管理模块与工厂目录有什么区别？</Text>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
                      现有"供应商目录"（系统设置 → 工厂列表）仅保存联系方式。
                      本模块在此基础上增加完整采购业务流：下采购单 → 跟进供应商发货 → 扫码入库确认 → 应付账款核销，
                      形成完整的采购财务闭环，让老板随时知道欠了哪家供应商多少钱。
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

export default ProcurementDashboard;
