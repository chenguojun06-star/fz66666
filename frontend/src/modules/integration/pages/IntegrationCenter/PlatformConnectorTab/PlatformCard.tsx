import React from 'react';
import { Col, Card, Badge, Tag, Tooltip, Space, Divider, Row, Button, Typography } from 'antd';
import {
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  SettingOutlined, SyncOutlined, LinkOutlined,
  ThunderboltOutlined, NumberOutlined,
} from '@ant-design/icons';
import { SYNC_MODE_LABELS, type PlatformMeta } from '../PlatformConnectorConstants';
import { renderIcon } from './icons';
import type { StatusMap, StatsMap } from './types';

const { Text, Paragraph } = Typography;

const modeLabel = (mode: 'pull' | 'webhook' | 'both') => {
  const colorMap = { pull: 'blue', webhook: 'green', both: 'purple' };
  return <Tag color={colorMap[mode]}>{SYNC_MODE_LABELS[mode]}</Tag>;
};

interface PlatformCardProps {
  p: PlatformMeta;
  statusMap: StatusMap;
  shopStatsMap: StatsMap;
  testing: boolean;
  syncing: boolean;
  activePlatformCode?: string;
  onConfig: (p: PlatformMeta) => void;
  onTest: (p: PlatformMeta) => void;
  onViewStats: (p: PlatformMeta) => void;
  onSync: (p: PlatformMeta) => void;
}

const PlatformCard: React.FC<PlatformCardProps> = ({
  p, statusMap, shopStatsMap, testing, syncing, activePlatformCode,
  onConfig, onTest, onViewStats, onSync,
}) => {
  const status = statusMap[p.code];
  const isConfigured = status?.configured;
  const isConnected = status?.status === 'ACTIVE' || status?.status === 'CONNECTED';
  const statsData = shopStatsMap[p.code];

  const statusDot = !status ? { color: 'var(--color-border-antd)', icon: <CloseCircleOutlined />, text: '未配置' }
    : isConfigured && isConnected ? { color: 'var(--color-success)', icon: <CheckCircleOutlined />, text: '已连接' }
    : isConfigured ? { color: 'var(--color-warning)', icon: <WarningOutlined />, text: '已配置' }
    : { color: 'var(--color-border-antd)', icon: <CloseCircleOutlined />, text: '未配置' };

  return (
    <Col key={p.code} xs={24} sm={12} lg={8} xl={6}>
      <Badge.Ribbon
        text={p.syncMode === 'pull' ? '主动同步' : '回调推送'}
        color={p.syncMode === 'pull' ? 'blue' : 'green'}
        style={{ opacity: 0.85 }}
      >
        <Card hoverable style={{ borderRadius: 12, height: '100%' }} styles={{ body: { padding: '20px 16px 12px' } }}>
          {/* 头部 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Space size={8}>
              <span style={{ fontSize: 24 }}>{renderIcon(p.icon)}</span>
              <Text strong style={{ fontSize: 16 }}>{p.name}</Text>
            </Space>
            <Tag icon={statusDot.icon} color={isConfigured && isConnected ? 'success' : isConfigured ? 'warning' : 'default'} style={{ margin: 0 }}>
              {statusDot.text}
            </Tag>
          </div>

          <Paragraph type="secondary" style={{ fontSize: 14, marginBottom: 8, minHeight: 36 }}>{p.desc}</Paragraph>
          <div style={{ marginBottom: 8 }}>{modeLabel(p.syncMode)}</div>

          {/* 功能标签 */}
          <div style={{ marginBottom: 8 }}>
            {p.features.slice(0, 3).map(f => (<Tag key={f} style={{ marginBottom: 4, fontSize: 14 }}>{f}</Tag>))}
            {p.features.length > 3 && (
              <Tooltip title={p.features.slice(3).join('、')}><Tag style={{ fontSize: 14 }}>+{p.features.length - 3}</Tag></Tooltip>
            )}
          </div>

          {/* 连接后的迷你数据 */}
          {isConfigured && statsData && (
            <Row gutter={8} style={{ marginBottom: 8 }}>
              <Col span={12}>
                <div style={{ fontSize: 14, color: '#888' }}>今日订单</div>
                <Text strong style={{ color: 'var(--color-primary)' }}>{statsData.todayOrders}</Text>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 14, color: '#888' }}>今日销售额</div>
                <Text strong style={{ color: 'var(--color-success)' }}>¥{statsData.todaySales}</Text>
              </Col>
            </Row>
          )}

          <Divider style={{ margin: '8px 0' }} />
          <Space orientation="vertical" style={{ width: '100%' }} size={6}>
            <Button type={isConfigured ? 'default' : 'primary'} icon={<SettingOutlined />} block onClick={() => onConfig(p)}>
              {isConfigured ? '修改凭证' : '配置连接'}
            </Button>
            {isConfigured && (
              <Button icon={<ThunderboltOutlined />} block loading={testing} onClick={() => onTest(p)}>连接测试</Button>
            )}
            {isConfigured && (
              <Button icon={<NumberOutlined />} block onClick={() => onViewStats(p)}>店铺数据</Button>
            )}
            {isConfigured && p.syncMode === 'pull' && (
              <Button icon={<SyncOutlined />} block loading={syncing && activePlatformCode === p.code} onClick={() => onSync(p)}>同步订单</Button>
            )}
            {p.docUrl && (
              <Button type="link" icon={<LinkOutlined />} block onClick={() => window.open(p.docUrl, '_blank')} style={{ padding: 0 }}>开放平台文档</Button>
            )}
          </Space>
        </Card>
      </Badge.Ribbon>
    </Col>
  );
};

export default PlatformCard;
