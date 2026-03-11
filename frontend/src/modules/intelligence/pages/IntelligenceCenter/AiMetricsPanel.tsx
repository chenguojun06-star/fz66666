import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Select } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';
import { getMetricsOverview, type MetricsSceneStat } from '@/services/intelligenceApi';

/** AI 调用指标看板 — 按场景聚合展示调用量/成功率/平均延迟/降级率 */
const AiMetricsPanel: React.FC = () => {
  const [data, setData] = useState<MetricsSceneStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMetricsOverview(days) as any;
      setData(Array.isArray(res) ? res : res?.data ?? []);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const totalCalls = data.reduce((s, r) => s + (r.total_calls || 0), 0);
  const totalSuccess = data.reduce((s, r) => s + (r.success_count || 0), 0);
  const avgLatency = data.length
    ? Math.round(data.reduce((s, r) => s + (r.avg_latency_ms || 0), 0) / data.length)
    : 0;
  const totalFallback = data.reduce((s, r) => s + (r.fallback_count || 0), 0);
  const successRate = totalCalls > 0 ? ((totalSuccess / totalCalls) * 100).toFixed(1) : '0.0';
  const fallbackRate = totalCalls > 0 ? ((totalFallback / totalCalls) * 100).toFixed(1) : '0.0';

  const rateColor = (pct: number) => pct >= 95 ? '#39ff14' : pct >= 80 ? '#00e5ff' : '#ff4136';
  const latencyColor = (ms: number) => ms <= 500 ? '#39ff14' : ms <= 2000 ? '#f7a600' : '#ff4136';

  return (
    <div className="c-card">
      <div className="c-card-title">
        <DashboardOutlined style={{ marginRight: 6, color: '#00e5ff' }} />
        AI 调用指标
        <span className="c-card-badge" style={{ background: 'rgba(0,229,255,0.12)', color: '#00e5ff', borderColor: '#00e5ff' }}>
          近 {days} 天
        </span>
        <Select
          size="small"
          value={days}
          onChange={setDays}
          style={{ marginLeft: 'auto', width: 90 }}
          options={[
            { label: '近 1 天', value: 1 },
            { label: '近 7 天', value: 7 },
            { label: '近 30 天', value: 30 },
          ]}
        />
        <button className="c-suggest-btn" style={{ borderColor: 'rgba(0,229,255,0.3)', color: '#00e5ff', marginLeft: 8 }} onClick={load} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {error && <div style={{ color: '#ff4136', padding: '8px 0', fontSize: 12 }}>{error}</div>}

      {/* 汇总指标卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '12px 0' }}>
        <SummaryCard label="总调用" value={totalCalls} unit="次" />
        <SummaryCard label="成功率" value={successRate} unit="%" color={rateColor(parseFloat(successRate))} />
        <SummaryCard label="平均延迟" value={avgLatency} unit="ms" color={latencyColor(avgLatency)} />
        <SummaryCard label="降级率" value={fallbackRate} unit="%" color={parseFloat(fallbackRate) > 10 ? '#ff4136' : '#39ff14'} />
      </div>

      {/* 按场景明细 */}
      {data.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: '#5a7a9a', marginBottom: 8 }}>场景明细</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
            {data.map(r => {
              const sr = r.total_calls > 0 ? ((r.success_count / r.total_calls) * 100) : 0;
              return (
                <div key={r.scene} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
                  <Tag style={{ minWidth: 100, textAlign: 'center', background: 'rgba(167,139,250,0.08)', borderColor: '#a78bfa40', color: '#c4b5fd' }}>
                    {r.scene}
                  </Tag>
                  <span style={{ color: '#e2e8f0', minWidth: 60 }}>{r.total_calls} 次</span>
                  <span style={{ color: rateColor(sr), minWidth: 60 }}>{sr.toFixed(1)}%</span>
                  <span style={{ color: latencyColor(r.avg_latency_ms || 0), minWidth: 60 }}>{Math.round(r.avg_latency_ms || 0)}ms</span>
                  {r.fallback_count > 0 && (
                    <Tag color="orange" style={{ fontSize: 11 }}>降级 {r.fallback_count}</Tag>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && data.length === 0 && !error && (
        <div style={{ textAlign: 'center', color: '#5a7a9a', padding: 20, fontSize: 13 }}>
          暂无 AI 调用数据
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string | number; unit: string; color?: string }> = ({ label, value, unit, color }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: '#5a7a9a', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: color || '#e2e8f0' }}>
      {value}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{unit}</span>
    </div>
  </div>
);

export default AiMetricsPanel;
