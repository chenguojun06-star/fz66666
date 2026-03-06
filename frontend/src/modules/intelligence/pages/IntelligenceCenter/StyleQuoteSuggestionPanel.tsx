import React, { useState, useCallback } from 'react';
import { Input, Button, Tag, Table } from 'antd';
import { SearchOutlined, DollarOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';

const statusColor: Record<string, string> = {
  COMPLETED: '#39ff14', WAREHOUSED: '#39ff14',
  IN_PROGRESS: '#f7a600', DRAFT: '#888',
};

/** 款式报价建议面板 — 输入款号获取历史成本分析与建议报价 */
const StyleQuoteSuggestionPanel: React.FC = () => {
  const [styleNo, setStyleNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleQuoteSuggestionResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const no = styleNo.trim();
    if (!no) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await intelligenceApi.getStyleQuoteSuggestion(no);
      const d = (res as any)?.data as StyleQuoteSuggestionResponse | null;
      if (!d || !d.styleNo) { setError('未找到该款号的历史数据'); return; }
      setData(d);
    } catch {
      setError('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [styleNo]);

  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : `¥${Number(v).toFixed(2)}`;

  return (
    <div className="c-card">
      <div className="c-card-title">
        <DollarOutlined /> 款式报价智能建议
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="输入款号，如 FZ2024001"
          value={styleNo}
          onChange={e => setStyleNo(e.target.value)}
          onPressEnter={handleSearch}
          style={{ maxWidth: 260 }}
        />
        <Button icon={<SearchOutlined />} loading={loading} onClick={handleSearch} type="primary">
          查询
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          {/* 核心数据卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: '历史接单', value: `${data.historicalOrderCount} 单` },
              { label: '建议报价', value: fmt(data.suggestedPrice), highlight: true },
              { label: '综合成本', value: fmt(data.totalCost) },
              { label: '当前报价', value: fmt(data.currentQuotation) },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                border: item.highlight ? '1px solid #f7a600' : '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: item.highlight ? '#f7a600' : 'var(--text-primary)' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* 成本拆解 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: '面料成本', v: data.materialCost },
              { label: '加工成本', v: data.processCost },
            ].map(c => (
              <span key={c.label} style={{
                background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.3)',
                borderRadius: 4, padding: '3px 10px', fontSize: 12, color: '#f7a600',
              }}>
                {c.label}：{fmt(c.v)}
              </span>
            ))}
          </div>

          {/* 建议文案 */}
          <div style={{
            background: 'rgba(57,255,20,0.07)', border: '1px solid rgba(57,255,20,0.2)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-primary)',
          }}>
            {data.suggestion}
          </div>

          {/* 历史订单 */}
          {data.recentOrders?.length > 0 && (
            <Table
              size="small"
              rowKey="orderNo"
              dataSource={data.recentOrders}
              pagination={false}
              columns={[
                { title: '订单号', dataIndex: 'orderNo', width: 160 },
                { title: '数量', dataIndex: 'quantity', width: 80 },
                { title: '单价', dataIndex: 'unitPrice', render: (v: number) => fmt(v), width: 90 },
                {
                  title: '状态', dataIndex: 'status', width: 90,
                  render: (v: string) => <Tag color={statusColor[v] ?? 'default'}>{v}</Tag>,
                },
                { title: '时间', dataIndex: 'createTime', render: (v: string) => v?.slice(0, 10) },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
};

export default StyleQuoteSuggestionPanel;
