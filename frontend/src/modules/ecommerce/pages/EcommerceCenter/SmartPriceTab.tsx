import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button, Space, Tag, Tooltip, Statistic, Card, Row, Col, Modal, message } from 'antd';
import { DollarOutlined, ThunderboltOutlined, RobotOutlined, CheckCircleOutlined, ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import { useRequest } from '@/hooks/useRequest';
import api, { type ApiResult } from '@/utils/api';
import { extractApiData } from './utils';

interface PriceSuggestion {
  skuId: number;
  oldPrice: number;
  newPrice: number;
  priceChange: number;
  priceChangePercent: number;
  reason: string;
  synced: boolean;
  status: 'PENDING' | 'APPLIED';
  createTime?: string;
}

interface PriceStats {
  totalSuggestions: number;
  pendingCount: number;
  appliedCount: number;
  avgConfidence: number;
}

const SmartPriceTab: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<PriceSuggestion | null>(null);
  const [batchApplying, setBatchApplying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: suggestions, loading: suggestionsLoading, run: fetchSuggestions, refresh } = useRequest<PriceSuggestion[]>(
    async () => extractApiData(await api.get<ApiResult<PriceSuggestion[]>>('/ecommerce/price/suggestions'), []),
    { manual: false }
  );

  const { data: stats, run: fetchStats } = useRequest<PriceStats>(
    async () => extractApiData(await api.get<ApiResult<PriceStats>>('/ecommerce/price/stats'), {} as PriceStats),
    { manual: false }
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleGenerateSuggestions = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await api.post<ApiResult<unknown>>('/ecommerce/price/generate');
      message.success(res?.message || 'AI定价建议已生成');
      await fetchSuggestions();
      await fetchStats();
    } catch {
      message.error('生成定价建议失败');
    } finally {
      setGenerating(false);
    }
  }, [fetchSuggestions, fetchStats]);

  const handleApplyPrice = useCallback(async (record: PriceSuggestion) => {
    setSyncing(true);
    try {
      const res = await api.post<ApiResult<unknown>>(`/ecommerce/price/${record.skuId}/sync`);
      message.success(res?.message || '定价已同步到平台');
      await fetchSuggestions();
      await fetchStats();
    } catch {
      message.error('同步失败');
    } finally {
      setSyncing(false);
    }
  }, [fetchSuggestions, fetchStats]);

  const handleConfirmApply = useCallback(async () => {
    if (!currentRecord) return;
    setModalOpen(false);
    await handleApplyPrice(currentRecord);
    setCurrentRecord(null);
  }, [currentRecord, handleApplyPrice]);

  const handleBatchApply = useCallback(async () => {
    setBatchApplying(true);
    try {
      const res = await api.post<ApiResult<unknown>>('/ecommerce/price/batch-sync');
      message.success(res?.message || '批量同步完成');
      await fetchSuggestions();
      await fetchStats();
    } catch {
      message.error('批量同步失败');
    } finally {
      setBatchApplying(false);
    }
  }, [fetchSuggestions, fetchStats]);

  const handleRefresh = useCallback(() => {
    refresh();
    fetchStats();
  }, [refresh, fetchStats]);

  const filteredData = useMemo(() => {
    return suggestions || [];
  }, [suggestions]);

  const columns: ColumnsType<PriceSuggestion> = [
    { title: 'SKU ID', dataIndex: 'skuId', width: 100 },
    {
      title: '当前价格', dataIndex: 'oldPrice', width: 110, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 500 }}>¥{Number(v).toFixed(2)}</span>,
    },
    {
      title: '建议价格', dataIndex: 'newPrice', width: 110, align: 'right' as const,
      render: (v: number, r: PriceSuggestion) => {
        const color = r.priceChange >= 0 ? 'var(--color-danger)' : 'var(--color-success)';
        return <span style={{ color, fontWeight: 600 }}>¥{Number(v).toFixed(2)}</span>;
      },
    },
    {
      title: '价格变动', dataIndex: 'priceChangePercent', width: 110, align: 'center' as const,
      render: (v: number) => {
        const icon = v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;
        const color = v >= 0 ? 'var(--color-danger)' : 'var(--color-success)';
        return <span style={{ color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {icon} {v >= 0 ? '+' : ''}{Number(v).toFixed(1)}%
        </span>;
      },
    },
    {
      title: 'AI推理依据', dataIndex: 'reason', width: 260, ellipsis: true,
      render: (v?: string) => <Tooltip title={v || '-'}><span>{v || '-'}</span></Tooltip>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const colorMap: Record<string, string> = { PENDING: 'warning', APPLIED: 'success' };
        const labelMap: Record<string, string> = { PENDING: '待同步', APPLIED: '已同步' };
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>;
      },
    },
    {
      title: '操作', width: 120, render: (_: unknown, r: PriceSuggestion) => {
        if (r.status === 'PENDING') {
          return (
            <Space>
              <Button size="small" type="primary" loading={syncing} onClick={() => {
                setCurrentRecord(r);
                setModalOpen(true);
              }}>同步定价</Button>
            </Space>
          );
        }
        return <Tag color="success">已同步</Tag>;
      },
    },
  ];

  const pendingSuggestions = (suggestions || []).filter(s => s.status === 'PENDING');

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'var(--status-processing-bg)', borderRadius: 12 }}>
            <Statistic
              title="定价建议"
              value={stats?.totalSuggestions || 0}
              suffix="条"
              prefix={<DollarOutlined style={{ color: 'var(--color-primary)' }} />}
              styles={{ content: { color: 'var(--color-primary)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'var(--status-warning-bg)', borderRadius: 12 }}>
            <Statistic
              title="待处理"
              value={stats?.pendingCount || 0}
              suffix="条"
              prefix={<ThunderboltOutlined style={{ color: 'var(--color-warning)' }} />}
              styles={{ content: { color: 'var(--color-warning)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'var(--status-success-bg)', borderRadius: 12 }}>
            <Statistic
              title="已同步"
              value={stats?.appliedCount || 0}
              suffix="条"
              prefix={<CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
              styles={{ content: { color: 'var(--color-success)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'var(--color-bg-subtle)', borderRadius: 12 }}>
            <Statistic
              title="平均置信度"
              value={stats?.avgConfidence || 0}
              suffix="%"
              prefix={<RobotOutlined style={{ color: 'var(--color-accent-purple)' }} />}
              styles={{ content: { color: 'var(--color-accent-purple)' } }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
          AI 定价顾问根据库存水平、销量速度自动计算最优售价
        </span>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新数据</Button>
          <Button icon={<ThunderboltOutlined />} loading={generating} onClick={handleGenerateSuggestions}>AI 生成定价建议</Button>
          {pendingSuggestions.length > 0 && (
            <Button type="primary" icon={<ThunderboltOutlined />} loading={batchApplying} onClick={handleBatchApply}>
              批量同步 ({pendingSuggestions.length})
            </Button>
          )}
        </Space>
      </div>

      <ResizableTable<PriceSuggestion>
        dataSource={filteredData}
        columns={columns}
        rowKey="skuId"
        size="small"
        loading={suggestionsLoading}
        emptyDescription="暂无定价建议数据，点击「AI生成定价建议」开始计算"
      />

      <Modal
        title="确认同步定价"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleConfirmApply}
        okText="确认同步"
        cancelText="取消"
        confirmLoading={syncing}
      >
        {currentRecord && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>SKU ID: {currentRecord.skuId}</div>
            </div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>当前价格</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>¥{Number(currentRecord.oldPrice).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>建议价格</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: currentRecord.priceChange >= 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  ¥{Number(currentRecord.newPrice).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>变动幅度</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: currentRecord.priceChange >= 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {currentRecord.priceChange >= 0 ? '+' : ''}{Number(currentRecord.priceChangePercent).toFixed(1)}%
                </div>
              </div>
            </div>
            <div style={{ padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
              <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>AI 推理依据</div>
              <div>{currentRecord.reason}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SmartPriceTab;
