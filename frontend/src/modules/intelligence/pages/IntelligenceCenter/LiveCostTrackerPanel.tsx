import React, { useState, useCallback } from 'react';
import { Input, Button, Progress, Tag, Table } from 'antd';
import { MonitorOutlined, SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { LiveCostResponse } from '@/services/intelligence/intelligenceApi';

const statusColor: Record<string, string> = {
  AHEAD: '#39ff14', ON_TRACK: '#39ff14', WARNING: '#f7a600', OVER: '#ff4136',
  健康: '#39ff14', 预警: '#f7a600', 超支: '#ff4136',
};

/** 实时成本追踪面板 */
const LiveCostTrackerPanel: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LiveCostResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const id = orderId.trim();
    if (!id) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await intelligenceApi.getLiveCostTracker(id);
      const d = (res as any)?.data as LiveCostResponse | null;
      if (!d || !d.orderNo) { setError('未找到该订单的成本数据'); return; }
      setData(d);
    } catch {
      setError('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : `¥${Number(v).toFixed(2)}`;

  const costColor = data ? (statusColor[data.costStatus ?? ''] ?? '#888') : '#888';

  return (
    <div className="c-card">
      <div className="c-card-title">
        <MonitorOutlined /> 实时成本追踪
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="输入订单 ID"
          value={orderId}
          onChange={e => setOrderId(e.target.value)}
          onPressEnter={handleSearch}
          style={{ maxWidth: 240 }}
        />
        <Button icon={<SearchOutlined />} loading={loading} onClick={handleSearch} type="primary">
          追踪
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          {/* 基本信息 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: '订单', value: data.orderNo },
              { label: '款号', value: data.styleNo },
              { label: '工厂', value: data.factoryName },
              { label: '总数量', value: `${data.orderQuantity} 件` },
              { label: '已完成', value: `${data.completedQty} 件` },
            ].map(i => (
              <span key={i.label} style={{
                background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '3px 10px',
                fontSize: 12, color: 'var(--text-primary)',
              }}>
                <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}>{i.label}:</span>{i.value}
              </span>
            ))}
          </div>

          {/* 成本进度 */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 8,
            padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>成本进度</span>
              <Tag color={costColor} style={{ margin: 0 }}>{data.costStatus}</Tag>
            </div>
            <Progress
              percent={data.costProgress ?? 0}
              strokeColor={costColor}
              trailColor="rgba(255,255,255,0.1)"
              format={pct => `${pct}%`}
            />
          </div>

          {/* 财务指标 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '预计人工', value: fmt(data.estimatedLaborCost) },
              { label: '实际人工', value: fmt(data.actualLaborCost), highlight: true },
              { label: '预计营收', value: fmt(data.estimatedRevenue) },
              {
                label: '利润率',
                value: data.profitMargin != null ? `${data.profitMargin.toFixed(1)}%` : '—',
                color: data.profitMargin != null
                  ? data.profitMargin >= 15 ? '#39ff14' : data.profitMargin >= 0 ? '#f7a600' : '#ff4136'
                  : '#888',
              },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                border: item.highlight ? '1px solid rgba(247,166,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{
                  fontSize: 14, fontWeight: 600,
                  color: (item as any).color ?? (item.highlight ? '#f7a600' : 'var(--text-primary)'),
                }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 建议 */}
          {data.suggestion && (
            <div style={{
              background: 'rgba(57,255,20,0.07)', border: '1px solid rgba(57,255,20,0.2)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14,
              fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7,
            }}>
              {data.suggestion}
            </div>
          )}

          {/* 工序成本明细 */}
          {data.processBreakdown?.length > 0 && (
            <Table
              size="small"
              rowKey="processName"
              dataSource={data.processBreakdown}
              pagination={false}
              columns={[
                { title: '工序', dataIndex: 'processName' },
                { title: '单价', dataIndex: 'unitPrice', width: 90, render: fmt },
                { title: '已扫件', dataIndex: 'scannedQty', width: 80 },
                { title: '小计', dataIndex: 'cost', width: 100, render: fmt },
                {
                  title: '进度', dataIndex: 'progress', width: 90,
                  render: (v: number) => (
                    <Progress
                      percent={v}
                      size="small"
                      strokeColor={v >= 80 ? '#39ff14' : v >= 50 ? '#f7a600' : '#4fc3f7'}
                      showInfo={false}
                    />
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
};

export default LiveCostTrackerPanel;
