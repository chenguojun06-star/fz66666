import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, List, Progress, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, ExclamationCircleFilled, CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PredictionDeliveryRiskItem } from '@/services/intelligence/intelligenceApi';

const { Text, Title } = Typography;

interface DeliveryRiskCardProps {
  topN?: number;
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #fff)',
  borderColor: 'var(--color-border-secondary, #f0f0f0)',
  borderRadius: 12,
};

const riskConfig: Record<PredictionDeliveryRiskItem['riskLevel'], { color: string; label: string; icon: React.ReactNode }> = {
  HIGH: { color: 'var(--color-error, #ff4d4f)', label: '高风险', icon: <ExclamationCircleFilled /> },
  MEDIUM: { color: 'var(--color-warning, #faad14)', label: '中风险', icon: <WarningFilled /> },
  LOW: { color: 'var(--color-success, #52c41a)', label: '低风险', icon: <CheckCircleFilled /> },
};

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

const DeliveryRiskCard: React.FC<DeliveryRiskCardProps> = ({ topN = 10 }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PredictionDeliveryRiskItem[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await intelligenceApi.getDeliveryRisks(topN);
      setItems(Array.isArray(result) ? result.slice(0, topN) : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : '数据加载失败';
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [topN]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedItems = useMemo(() => {
    const order: Record<PredictionDeliveryRiskItem['riskLevel'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...items].sort((a, b) => {
      const diff = order[a.riskLevel] - order[b.riskLevel];
      if (diff !== 0) return diff;
      return (b.riskScore ?? 0) - (a.riskScore ?? 0);
    });
  }, [items]);

  const renderItem = (item: PredictionDeliveryRiskItem) => {
    const cfg = riskConfig[item.riskLevel];
    const progress = clamp(item.currentProgress ?? 0);
    const isHigh = item.riskLevel === 'HIGH';
    return (
      <List.Item style={{ padding: '12px 4px', borderBlockEnd: '1px solid var(--color-border-secondary, #f0f0f0)' }}>
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text strong style={{ color: 'var(--color-text-primary, #333)' }}>{item.orderNo}</Text>
              <Tag color={cfg.color} style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}1A` }}>
                <span style={{ marginRight: 4 }}>{cfg.icon}</span>
                {cfg.label}
              </Tag>
              <Text style={{ color: 'var(--color-text-secondary, #666)' }}>{item.styleName}</Text>
              <Text style={{ color: 'var(--color-text-tertiary, #999)' }}>客户：{item.customerName}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Tooltip title={`风险评分 ${item.riskScore ?? '-'}`}>
                <Text style={{ color: cfg.color, fontWeight: 600 }}>{item.riskScore ?? '-'}</Text>
              </Tooltip>
              <Tooltip title={item.delayDays && item.delayDays > 0 ? `预计延误 ${item.delayDays} 天` : '进度正常'}>
                <Tag color={item.delayDays && item.delayDays > 0 ? 'red' : 'green'} style={{ margin: 0 }}>
                  {item.delayDays && item.delayDays > 0 ? `延误 ${item.delayDays} 天` : '按时'}
                </Tag>
              </Tooltip>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-tertiary, #999)' }}>
            <span>交期：{item.deliveryDate}</span>
            <span>预计完成：{item.predictedCompletionDate}</span>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary, #666)', marginBottom: 4 }}>
              <span>当前生产进度</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <Progress
              percent={progress}
              size="small"
              strokeColor={cfg.color}
              showInfo={false}
              status={isHigh ? 'exception' : undefined}
            />
          </div>

          {item.reason ? (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
              <Text type="secondary">原因：{item.reason}</Text>
            </div>
          ) : null}
        </div>
      </List.Item>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div style={{ padding: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton active key={i} paragraph={{ rows: 2 }} title={false} style={{ marginBottom: 16 }} />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary, #666)' }}>
          <ExclamationCircleFilled style={{ color: 'var(--color-error, #ff4d4f)', fontSize: 28 }} />
          <div style={{ marginTop: 8 }}>{error}</div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchData} style={{ marginTop: 12 }}>
            重试
          </Button>
        </div>
      );
    }

    if (sortedItems.length === 0) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary, #999)' }}>
          <CheckCircleFilled style={{ fontSize: 32, color: 'var(--color-success, #52c41a)' }} />
          <div style={{ marginTop: 8 }}>暂无高风险订单</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>生产进度正常</div>
        </div>
      );
    }

    return (
      <List
        itemLayout="vertical"
        dataSource={sortedItems}
        split={false}
        renderItem={renderItem}
      />
    );
  };

  return (
    <Card
      style={CARD_STYLE}
      title={
        <Space size={8}>
          <span style={{ color: 'var(--color-error, #ff4d4f)' }}>●</span>
          <span style={{ fontWeight: 600 }}>高风险订单 Top {topN}</span>
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
      <Title level={5} style={{ margin: '0 0 8px 0', color: 'var(--color-text-secondary, #666)', fontWeight: 500 }}>
        按风险等级与评分排序
      </Title>
      {renderBody()}
    </Card>
  );
};

export default DeliveryRiskCard;
