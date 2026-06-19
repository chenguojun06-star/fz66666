import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, List, Progress, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, ExclamationCircleFilled, CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PredictionDeliveryRiskItem } from '@/services/intelligence/intelligenceApi';

const { Text, Title } = Typography;

interface DeliveryRiskCardProps {
  topN?: number;
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-bg-elevated, var(--color-bg-base))',
  borderColor: 'var(--color-border-secondary, var(--color-border-light))',
  borderRadius: 12,
};

const riskConfig: Record<PredictionDeliveryRiskItem['riskLevel'], { color: string; label: string; icon: React.ReactNode }> = {
  HIGH: { color: 'var(--color-error, var(--color-danger))', label: '高风险', icon: <ExclamationCircleFilled /> },
  MEDIUM: { color: 'var(--color-warning, var(--color-warning))', label: '中风险', icon: <WarningFilled /> },
  LOW: { color: 'var(--color-success, var(--color-success))', label: '低风险', icon: <CheckCircleFilled /> },
};

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

const DeliveryRiskCard: React.FC<DeliveryRiskCardProps> = ({ topN = 10 }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PredictionDeliveryRiskItem[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(true);

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

  const handleGoToDetail = useCallback(
    (item: PredictionDeliveryRiskItem) => {
      navigate(`/production/progress-detail?orderNo=${encodeURIComponent(item.orderNo)}`);
    },
    [navigate],
  );

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
    const handleRowClick = () => handleGoToDetail(item);
    const handleButtonClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleGoToDetail(item);
    };
    return (
      <List.Item
        onClick={handleRowClick}
        style={{
          padding: '12px 8px',
          borderBlockEnd: '1px solid var(--color-border-secondary, var(--color-border-light))',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
          borderRadius: 6,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-fill-1, var(--color-bg-container))';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
      >
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
              <Button type="link" size="small" onClick={handleButtonClick}>
                查看详情
              </Button>
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
          <ExclamationCircleFilled style={{ color: 'var(--color-error, var(--color-danger))', fontSize: 28 }} />
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
          <CheckCircleFilled style={{ fontSize: 32, color: 'var(--color-success, var(--color-success))' }} />
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
        <Space size={8} style={{ cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
          <span style={{ color: 'var(--color-error, var(--color-danger))' }}>●</span>
          <span style={{ fontWeight: 600 }}>高风险订单 Top {topN}</span>
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
      {!collapsed && (
        <>
          <Title level={5} style={{ margin: '0 0 8px 0', color: 'var(--color-text-secondary, #666)', fontWeight: 500 }}>
            按风险等级与评分排序
          </Title>
          {renderBody()}
        </>
      )}
    </Card>
  );
};

export default DeliveryRiskCard;
