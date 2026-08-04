import React from 'react';
import { Button, Card, Col, Row, Tag, Typography } from 'antd';
import { ArrowRightOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons';
import { LOCKED_FEATURES } from '../helpers';

const { Title, Text, Paragraph } = Typography;

// 未订阅时展示的锁定页（遵循项目UI规范：白底卡片 + 深色文字 + 镂空按钮 + pastel淡背景区分）
const LockedView: React.FC<{ onGoStore: () => void }> = ({ onGoStore }) => (
  <>
    {/* 顶部 Hero 区：淡蓝背景 + 深色文字（高对比度，清晰可读） */}
    <Card
      style={{
        background: '#e8f2ff', // 淡蓝 pastel 背景（项目规范色）
        border: 'none',
        marginBottom: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', // 阴影替代边框
      }}
      styles={{ body: { padding: '28px 32px' } }}
    >
      <Row align="middle" gutter={24}>
        <Col flex="auto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <LockOutlined style={{ fontSize: 20, color: 'var(--color-primary)' }} />
            <Tag color="gold" style={{ fontWeight: 600, margin: 0 }}>付费模块 · ¥599/月</Tag>
          </div>
          <Title level={3} style={{ color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
            客户管理 CRM
          </Title>
          <Paragraph style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 14 }}>
            深度整合您的生产数据，让每位B端客户都能实时追踪到自己的订单进度。低价对标鼎普 CRM（¥3000+/月），专为中小服装工厂设计。
          </Paragraph>
        </Col>
        <Col>
          <Button
            size="large"
            icon={<RocketOutlined />}
            ghost
            type="primary"
            style={{ height: 44, padding: '0 28px', fontWeight: 600 }}
            onClick={onGoStore}
          >
            立即开通 <ArrowRightOutlined />
          </Button>
        </Col>
      </Row>
    </Card>

    {/* 功能列表区：白色卡片 + 阴影 */}
    <Title level={5} style={{ marginBottom: 16, color: 'var(--color-text-primary)' }}>
      开通后解锁以下功能
    </Title>
    <Row gutter={[16, 16]}>
      {LOCKED_FEATURES.map(f => (
        <Col span={8} key={f.title}>
          <Card
            style={{
              height: '100%',
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              border: 'none',
            }}
            hoverable={false}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 28, lineHeight: 1, color: 'var(--color-primary)' }}>{f.icon}</span>
              <div>
                <Text strong style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>{f.title}</Text>
                <Paragraph style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  {f.desc}
                </Paragraph>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>

    {/* 底部说明区：淡紫背景 + 镂空按钮 */}
    <Card
      style={{
        marginTop: 12,
        background: '#f0effe', // 淡紫 pastel 背景（项目规范色）
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <Row gutter={24} align="middle">
        <Col span={16}>
          <Text strong style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>
            为什么比鼎普便宜5倍？
          </Text>
          <Paragraph style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--color-text-secondary)' }}>
            鼎普 CRM 模块定价 ¥3000+/月，功能复杂适合大企业。本模块专注中小服装工厂核心需求：
            应收款追踪 + 客户门户查单，去掉80%用不上的功能，降到 ¥599/月，90天回本，开通当月即可用起来。
          </Paragraph>
        </Col>
        <Col span={8} style={{ textAlign: 'center' }}>
          <Button
            size="large"
            ghost
            type="primary"
            onClick={onGoStore}
            style={{ width: '100%', fontWeight: 600 }}
          >
            前往应用商店开通
          </Button>
        </Col>
      </Row>
    </Card>
  </>
);

export default LockedView;
