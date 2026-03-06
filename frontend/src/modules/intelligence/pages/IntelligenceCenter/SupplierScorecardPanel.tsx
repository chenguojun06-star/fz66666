import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { StarOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SupplierScorecardResponse } from '@/services/intelligence/intelligenceApi';

const tierConfig: Record<string, { color: string; label: string }> = {
  S: { color: '#f7a600', label: 'S级' },
  A: { color: '#39ff14', label: 'A级' },
  B: { color: '#4fc3f7', label: 'B级' },
  C: { color: '#ff4136', label: 'C级' },
};

/** 工厂供应商评分卡面板 */
const SupplierScorecardPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SupplierScorecardResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getSupplierScorecard();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const tierCounts = data?.topCount ?? {};

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><StarOutlined /> 工厂综合评分卡</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '加载评分'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          {/* 分级总览 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {Object.entries(tierConfig).map(([tier, cfg]) => (
              <div key={tier} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 16px',
                border: `1px solid ${cfg.color}44`, textAlign: 'center', minWidth: 64,
              }}>
                <Tag color={cfg.color} style={{ fontSize: 13, padding: '2px 8px' }}>{cfg.label}</Tag>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: cfg.color }}>
                  {(tierCounts as any)[tier] ?? 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>家工厂</div>
              </div>
            ))}
          </div>

          {/* 综合建议 */}
          {data.summary && (
            <div style={{
              background: 'rgba(57,255,20,0.07)', border: '1px solid rgba(57,255,20,0.2)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14,
              fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7,
            }}>
              {data.summary}
            </div>
          )}

          {/* 评分明细表 */}
          <Table
            size="small"
            rowKey="factoryName"
            dataSource={data.scores}
            pagination={{ pageSize: 8, size: 'small' }}
            columns={[
              { title: '工厂', dataIndex: 'factoryName', ellipsis: true },
              {
                title: '级别', dataIndex: 'tier', width: 60,
                render: (v: string) => {
                  const cfg = tierConfig[v];
                  return cfg ? <Tag color={cfg.color} style={{ fontSize: 11 }}>{v}</Tag> : v;
                },
              },
              {
                title: '准时率', dataIndex: 'onTimeRate', width: 80,
                render: (v: number) => (
                  <span style={{ color: v >= 0.9 ? '#39ff14' : v >= 0.75 ? '#f7a600' : '#ff4136' }}>
                    {(v * 100).toFixed(0)}%
                  </span>
                ),
              },
              {
                title: '质量分', dataIndex: 'qualityScore', width: 80,
                render: (v: number) => (
                  <span style={{ color: v >= 90 ? '#39ff14' : v >= 75 ? '#f7a600' : '#ff4136' }}>
                    {v?.toFixed(1)}
                  </span>
                ),
              },
              {
                title: '完成率', dataIndex: 'completionRate', width: 80,
                render: (v: number) => `${(v * 100).toFixed(0)}%`,
              },
              {
                title: '综合分', dataIndex: 'overallScore', width: 80,
                sorter: (a, b) => (a.overallScore ?? 0) - (b.overallScore ?? 0),
                defaultSortOrder: 'descend',
                render: (v: number) => (
                  <strong style={{ color: v >= 90 ? '#f7a600' : v >= 75 ? '#39ff14' : v >= 60 ? '#4fc3f7' : '#ff4136' }}>
                    {v?.toFixed(1)}
                  </strong>
                ),
              },
              { title: '订单数', dataIndex: 'orderCount', width: 70 },
            ]}
          />
        </>
      )}
    </div>
  );
};

export default SupplierScorecardPanel;
