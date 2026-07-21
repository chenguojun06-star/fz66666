import React from 'react';
import { Button, Card, Col, Row, Tag, Typography } from 'antd';
import { ArrowRightOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons';
import { LOCKED_FEATURES } from '../helpers';

const { Title, Text, Paragraph } = Typography;

// 未订阅时展示的锁定页
const LockedView: React.FC<{ onGoStore: () => void }> = ({ onGoStore }) => (
  <>
    <Card
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', marginBottom: 12 }}
      styles={{ body: { padding: '32px 40px' } }}
    >
      <Row align="middle" gutter={24}>
        <Col flex="auto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <LockOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)' }} />
            <Tag color="gold" style={{ fontWeight: 600 }}>付费模块 · ¥599/月</Tag>
          </div>
          <Title level={3} style={{ color: 'var(--color-bg-base)', margin: '0 0 8px' }}>客户管理 CRM</Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>
            深度整合您的生产数据，让每位B端客户都能实时追踪到自己的订单进度。低价对标鼎普 CRM（¥3000+/月），专为中小服装工厂设计。
          </Paragraph>
        </Col>
        <Col>
          <Button type="primary" size="large" icon={<RocketOutlined />}
            style={{ background: 'var(--color-bg-base)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontWeight: 600, height: 44, padding: '0 28px' }}
            onClick={onGoStore}
          >
            立即开通 <ArrowRightOutlined />
          </Button>
        </Col>
      </Row>
    </Card>
    <Title level={5} style={{ marginBottom: 16 }}>开通后解锁以下功能</Title>
    <Row gutter={[16, 16]}>
      {LOCKED_FEATURES.map(f => (
        <Col span={8} key={f.title}>
          <Card style={{ height: '100%', opacity: 0.85 }} hoverable={false}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{f.icon}</span>
              <div>
                <Text strong>{f.title}</Text>
                <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 14 }}>{f.desc}</Paragraph>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
    <Card style={{ marginTop: 12, background: '#f8f9fa' }} variant="borderless">
      <Row gutter={24} align="middle">
        <Col span={16}>
          <Text strong>为什么比鼎普便宜5倍？</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 14 }}>
            鼎普 CRM 模块定价 ¥3000+/月，功能复杂适合大企业。本模块专注中小服装工厂核心需求：
            应收款追踪 + 客户门户查单，去掉80%用不上的功能，降到 ¥599/月，90天回本，开通当月即可用起来。
          </Paragraph>
        </Col>
        <Col span={8} style={{ textAlign: 'center' }}>
          <Button type="primary" size="large" onClick={onGoStore} style={{ width: '100%' }}>
            前往应用商店开通
          </Button>
        </Col>
      </Row>
    </Card>
  </>
);

export default LockedView;
