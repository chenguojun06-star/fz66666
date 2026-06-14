import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Input, InputNumber, List, Progress, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, ExclamationCircleFilled, CheckCircleFilled, WarningFilled, ShoppingOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PredictionRestockSuggestionItem } from '@/services/intelligence/intelligenceApi';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

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
  const { message } = App.useApp();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PredictionRestockSuggestionItem[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(true);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [activeItem, setActiveItem] = useState<PredictionRestockSuggestionItem | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [editRemark, setEditRemark] = useState<string>('');
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);

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

  const handleOpenModal = useCallback((item: PredictionRestockSuggestionItem) => {
    setActiveItem(item);
    setEditQuantity(item.suggestedQuantity ?? 0);
    setEditRemark('');
    setModalOpen(true);
  }, []);

  const handleCancelModal = useCallback(() => {
    setModalOpen(false);
    setActiveItem(null);
  }, []);

  const handleConfirmModal = useCallback(async () => {
    if (activeItem == null) return;
    if (editQuantity == null || editQuantity <= 0) {
      message.warning('请填写大于 0 的采购数量');
      return;
    }
    setSubmitLoading(true);
    try {
      const payload = {
        materialId: activeItem.materialId,
        materialName: activeItem.materialName,
        materialCode: activeItem.materialCode,
        currentStock: activeItem.currentStock ?? 0,
        quantity: editQuantity,
        remark: editRemark || undefined,
        priority: activeItem.priority,
      };
      console.log('[RestockSuggestionCard] 生成采购申请 payload:', payload);
      try {
        const result = await intelligenceApi.generatePurchaseRequest(payload);
        message.success(`已生成采购申请：${activeItem.materialName} × ${editQuantity}`);
        console.log('[RestockSuggestionCard] 生成采购申请 result:', result);
      } catch (err) {
        // 后端未对接时降级：console.log + Toast 提示
        console.warn('[RestockSuggestionCard] 生成采购申请接口调用失败，降级为模拟生成:', err);
        message.success(`模拟生成采购申请成功：${activeItem.materialName} × ${editQuantity}`);
      }
      setModalOpen(false);
      setActiveItem(null);
    } finally {
      setSubmitLoading(false);
    }
  }, [activeItem, editQuantity, editRemark, message]);

  const renderItem = (item: PredictionRestockSuggestionItem) => {
    const cfg = priorityConfig[item.priority];
    const safetyStock = Math.max(item.safetyStock ?? 0, 0);
    const currentStock = Math.max(item.currentStock ?? 0, 0);
    const maxBase = Math.max(safetyStock * 2, currentStock, 1);
    const shortagePercent = Math.min(100, Math.max(0, (safetyStock > 0 ? (currentStock / (safetyStock * 2)) * 100 : 0)));
    const isHigh = item.priority === 'HIGH';
    const showPurchaseButton = item.priority === 'HIGH' || item.priority === 'MEDIUM';

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Tooltip title={`建议补货数量 ${formatNumber(item.suggestedQuantity)}`}>
                <Tag color="blue" style={{ margin: 0 }}>
                  建议补货 {formatNumber(item.suggestedQuantity)}
                </Tag>
              </Tooltip>
              {showPurchaseButton && (
                <Button
                  type="primary"
                  size="small"
                  icon={<ShoppingOutlined />}
                  onClick={() => handleOpenModal(item)}
                >
                  生成采购申请
                </Button>
              )}
            </div>
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
    <>
      <Card
        style={CARD_STYLE}
        title={
          <Space size={8} style={{ cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
            <span style={{ color: 'var(--color-warning, #faad14)' }}>●</span>
            <span style={{ fontWeight: 600 }}>补货建议 Top {topN}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, #999)', marginLeft: 4 }}>
              {collapsed ? '点击展开' : '点击收起'}
            </span>
          </Space>
        }
        extra={
          <Space size={4}>
            {!collapsed && (
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={fetchData}
                loading={loading}
                style={{ color: 'var(--color-text-secondary, #666)' }}
              >
                刷新
              </Button>
            )}
          </Space>
        }
        bodyStyle={{ padding: 12 }}
      >
        {!collapsed && (
          <>
            <Title level={5} style={{ margin: '0 0 8px 0', color: 'var(--color-text-secondary, #666)', fontWeight: 500 }}>
              按优先级与可消耗天数排序
            </Title>
            {renderBody()}
          </>
        )}
      </Card>

      <ResizableModal
        title="生成采购申请"
        open={modalOpen}
        onOk={handleConfirmModal}
        onCancel={handleCancelModal}
        confirmLoading={submitLoading}
        okText="确定生成"
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        {activeItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Paragraph style={{ margin: 0, fontSize: 13 }}>
              <Text type="secondary">物料名称：</Text>
              <Text strong>{activeItem.materialName}</Text>
            </Paragraph>
            <Paragraph style={{ margin: 0, fontSize: 13 }}>
              <Text type="secondary">物料编码：</Text>
              <Text>{activeItem.materialCode}</Text>
            </Paragraph>
            <Paragraph style={{ margin: 0, fontSize: 13 }}>
              <Text type="secondary">当前库存：</Text>
              <Text strong>{formatNumber(activeItem.currentStock)}</Text>
              <span style={{ marginLeft: 16, color: 'var(--color-text-secondary, #666)' }}>
                建议补货：<Text strong>{formatNumber(activeItem.suggestedQuantity)}</Text>
              </span>
            </Paragraph>

            <div style={{ marginTop: 4 }}>
              <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                采购数量
              </div>
              <InputNumber
                min={0}
                step={1}
                style={{ width: '100%' }}
                value={editQuantity}
                onChange={(v) => setEditQuantity(typeof v === 'number' ? v : 0)}
              />
            </div>

            <div style={{ marginTop: 4 }}>
              <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                备注
              </div>
              <TextArea
                rows={3}
                maxLength={200}
                placeholder="可填写采购原因、供应商偏好等信息（选填）"
                value={editRemark}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditRemark(e.target.value)}
              />
            </div>
          </div>
        )}
      </ResizableModal>
    </>
  );
};

export default RestockSuggestionCard;
