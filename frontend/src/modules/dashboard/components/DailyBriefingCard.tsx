import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Row, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, WarningOutlined, ThunderboltOutlined, InboxOutlined, FundOutlined, ClockCircleOutlined, AlertOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { DailyBriefing } from '@/services/intelligence/intelligenceApi';

const { Text, Title } = Typography;

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-bg-elevated, var(--color-bg-base))',
  borderColor: 'var(--color-border-secondary, var(--color-border-light))',
  borderRadius: 12,
};

const METRIC_CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-bg-container, var(--color-bg-container))',
  borderColor: 'var(--color-border-secondary, var(--color-border-light))',
  borderRadius: 8,
  padding: 12,
};

const formatNumber = (value?: number): string => {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('zh-CN');
};

const formatPercent = (value?: number): string => {
  if (value == null || Number.isNaN(value)) return '-';
  const v = value > 1 ? value : value * 100;
  return `${v.toFixed(1)}%`;
};

interface MetricItem {
  key: keyof DailyBriefing;
  label: string;
  icon: React.ReactNode;
  formatter: (value: number | undefined) => string;
  accent: string;
}

const METRICS: MetricItem[] = [
  { key: 'totalOrders', label: '总订单数', icon: <InboxOutlined />, formatter: formatNumber, accent: 'var(--color-primary, var(--color-primary))' },
  { key: 'pendingOrders', label: '待处理订单', icon: <ClockCircleOutlined />, formatter: formatNumber, accent: 'var(--color-warning, var(--color-warning))' },
  { key: 'atRiskOrders', label: '风险订单', icon: <WarningOutlined />, formatter: formatNumber, accent: 'var(--color-error, var(--color-danger))' },
  { key: 'totalProductionProgress', label: '整体生产进度', icon: <FundOutlined />, formatter: formatPercent, accent: 'var(--color-success, var(--color-success))' },
  { key: 'delayedStyleCount', label: '延期款数', icon: <AlertOutlined />, formatter: formatNumber, accent: 'var(--color-error, var(--color-danger))' },
  { key: 'lowStockItems', label: '低库存物料', icon: <ThunderboltOutlined />, formatter: formatNumber, accent: 'var(--color-warning, var(--color-warning))' },
];

const DailyBriefingCard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DailyBriefing | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await intelligenceApi.getDailyBriefing();
      setData(result ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '数据加载失败';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const isEmpty = !loading && !error && !data;

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ padding: 8 }}>
          <Skeleton active paragraph={{ rows: 2 }} title />
          <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
            {METRICS.map((m) => (
              <Col xs={12} sm={8} md={8} lg={8} xl={6} key={m.key}>
                <div style={METRIC_CARD_STYLE}>
                  <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={false} />
                  <Skeleton.Button active size="small" block style={{ marginTop: 8 }} />
                </div>
              </Col>
            ))}
          </Row>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary, #666)' }}>
          <WarningOutlined style={{ color: 'var(--color-error, var(--color-danger))', fontSize: 28 }} />
          <div style={{ marginTop: 8 }}>{error}</div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchData} style={{ marginTop: 12 }}>
            重试
          </Button>
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary, #999)' }}>
          <InboxOutlined style={{ fontSize: 32 }} />
          <div style={{ marginTop: 8 }}>暂无简报数据</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>稍后刷新重试</div>
        </div>
      );
    }

    const summaryText = data?.summary || '今日简报，系统健康';
    return (
      <div style={{ padding: 8 }}>
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'linear-gradient(90deg, var(--color-primary-bg, #e6f4ff) 0%, var(--color-bg-container, var(--color-bg-container)) 100%)',
            border: '1px solid var(--color-border-secondary, var(--color-border-light))',
          }}
        >
          <Space>
            <Tag color="processing" style={{ margin: 0 }}>
              AI 摘要
            </Tag>
            <Text style={{ color: 'var(--color-text-primary, #333)' }}>{summaryText}</Text>
          </Space>
        </div>
        <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
          {METRICS.map((metric) => {
            const raw = data?.[metric.key] as number | undefined;
            return (
              <Col xs={12} sm={8} md={8} lg={8} xl={6} key={metric.key}>
                <Tooltip title={`${metric.label}：${metric.formatter(raw ?? 0)}`}>
                  <div style={METRIC_CARD_STYLE}>
                    <Space size={8} align="center">
                      <span
                        aria-hidden
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `${metric.accent}1A`,
                          color: metric.accent,
                          fontSize: 14,
                        }}
                      >
                        {metric.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #999)' }}>{metric.label}</div>
                        <Title level={5} style={{ margin: '2px 0 0 0', color: 'var(--color-text-primary, #333)', fontWeight: 600 }}>
                          {metric.formatter(raw)}
                        </Title>
                      </div>
                    </Space>
                  </div>
                </Tooltip>
              </Col>
            );
          })}
        </Row>
      </div>
    );
  };

  return (
    <Card
      style={CARD_STYLE}
      title={
        <Space size={8} style={{ cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
          <span style={{ color: 'var(--color-primary, var(--color-primary))' }}>●</span>
          <span style={{ fontWeight: 600 }}>今日简报</span>
          <Tag color="green" style={{ marginLeft: 8 }}>
            系统健康
          </Tag>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, #999)', marginLeft: 4 }}>
            {collapsed ? '点击展开' : '点击收起'}
          </span>
        </Space>
      }
      extra={
        <Button
          type="text"
          icon={<ReloadOutlined />}
          onClick={fetchData}
          loading={loading}
          style={{ color: 'var(--color-text-secondary, #666)' }}
        >
          刷新
        </Button>
      }
      bodyStyle={{ padding: 12 }}
    >
      {!collapsed && renderContent()}
    </Card>
  );
};

export default DailyBriefingCard;
