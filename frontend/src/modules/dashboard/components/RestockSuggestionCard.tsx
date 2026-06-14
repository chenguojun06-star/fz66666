import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, List, Progress, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, ExclamationCircleFilled, CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PredictionRestockSuggestionItem } from '@/services/intelligence/intelligenceApi';

const { Text, Title } = Typography;

interface RestockSuggestionCardProps {
  topN?: number;
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #fff)',
  borderColor: 'var(--color-border-secondary, #f0f0f0)',
  borderRadius: 12,
};

const priorityConfig: Record<
  PredictionRestockSuggestionItem['priority'],
  { color: string; label: string; icon: React.ReactNode }
> = {
  HIGH: { color: 'var(--color-error, #ff4d4f)', label: '高优先级', icon: <ExclamationCircleFilled /> },
  MEDIUM: { color: 'var(--color-warning, #faad14)', label: '中优先级', icon: <WarningFilled /> },
  LOW: { color: 'var(--color-success, #52c41a)', label: '低优先级', icon: <CheckCircleFilled /> },
};

const formatNumber = (value?: number): string => {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('zh-CN');
};

const RestockSuggestionCard: React.FC<RestockSuggestionCardProps> = ({ topN = 10 }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PredictionRestockSuggestionItem[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await intelligenceApi.getRestockSuggestions(topN);
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
    const order: Record<PredictionRestockSuggestionItem['priority'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...items].sort((a, b) => {
      const diff = order[a.priority] - order[b.priority];
      if (diff !== 0) return diff;
      return (a.daysUntilShortage ?? 0) - (b.daysUntilShortage ?? 0);
    });
  }, [items]);

  const renderItem = (item: PredictionRestockSuggestionItem) => {
    const cfg = priorityConfig[item.priority];
    const safetyStock = Math.max(item.safetyStock ?? 0, 0);
    const currentStock = Math.max(item.currentStock ?? 0, 0);
    const maxBase = Math.max(safetyStock * 2, currentStock, 1);
    const shortagePercent = Math.min(100, Math.max(0, (safetyStock > 0 ? (currentStock / (safetyStock * 2)) * 100 : 0)));
    const daysUntil = item.daysUntilShortage;
    const isHigh = item.priority === 'HIGH';

    return (
      <List.Item style={{ padding: '12px 4px', borderBlockEnd: '1px solid var(--color-border-secondary, #f0f0f0)' }}>
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text strong style={{ color: 'var(--color-text-primary, #333)' }}>{item.materialName}</Text>
              <Text style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12 }}>({item.materialCode})</Text>
              <Tag color={cfg.color} style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}1A`, margin: 0 }}>
                <span style={{ marginRight: 4 }}>{cfg.icon}</span>
                {cfg.label}
              </Tag>
            </div>
            <Tooltip title={`建议补货数量 ${formatNumber(item.suggestedQuantity)}`}>
              <Tag color="blue" style={{ margin: 0 }}>
                建议补货 {formatNumber(item.suggestedQuantity)}
              </Tag>
            </Tooltip>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-tertiary, #999)' }}>
            <span>当前库存：<Text style={{ color: 'var(--color-text-secondary, #666)' }} strong>{formatNumber(item.currentStock)}</Text></span>
            <span>安全库存：<Text style={{ color: 'var(--color-text-secondary, #666)' }} strong>{formatNumber(item.safetyStock)}</Text></span>
            <span>日均消耗：<Text style={{ color: 'var(--color-text-secondary, #666)' }} strong>{formatNumber(item.avgDailyUsage)}</Text></span>
            <span style={{ color: isHigh ? cfg.color : 'var(--color-text-secondary, #666)' }}>
              可消耗天数：{item.daysUntilShortage != null ? `${item.daysUntilShortage} 天` : '-'}
            </span>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary, #666)', marginBottom: 4 }}>
              <span>库存水位（相对 2×安全库存）</span>
              <span>{shortagePercent.toFixed(0)}%</span>
            </div>
            <Progress
              percent={shortagePercent}
              size="small"
              strokeColor={cfg.color}
              showInfo={false}
              status={isHigh ? 'exception' : undefined}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary, #999)', marginTop: 4 }}>
              <span>0</span>
              <span>安全库存线 ({formatNumber(item.safetyStock)})</span>
              <span>{formatNumber(safetyStock * 2)}</span>
            </div>
            <div
              aria-hidden
              style={{
                position: 'relative',
                height: 0,
                top: -14,
              }}
            >
              <span style={{ position: 'absolute', left: `${Math.min(50, 100)}%`, top: -6, width: 2, height: 14, background: 'var(--color-warning, #faad14)' }} />
            </div>
            {/* 避免对未使用变量 maxBase 的警告 */}
            <span aria-hidden style={{ display: 'none' }}>{maxBase}</span>
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
          <div style={{ marginTop: 8 }}>暂无补货建议</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>库存水位健康</div>
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
          <span style={{ color: 'var(--color-warning, #faad14)' }}>●</span>
          <span style={{ fontWeight: 600 }}>补货建议 Top {topN}</span>
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
        按优先级与可消耗天数排序
      </Title>
      {renderBody()}
    </Card>
  );
};

export default RestockSuggestionCard;
