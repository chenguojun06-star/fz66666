import React, { useState, useCallback } from 'react';
import { Input, Button, Progress, Tag, Table } from 'antd';
import { BugOutlined, SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { DefectTraceResponse } from '@/services/intelligence/intelligenceApi';

const riskColor: Record<string, string> = {
  low: '#39ff14', medium: '#f7a600', high: '#ff4136',
};

/** 次品溯源可视化面板 — 按订单分析工人/工序缺陷分布 */
const DefectTracePanel: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DefectTraceResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const id = orderId.trim();
    if (!id) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await intelligenceApi.getDefectTrace(id);
      const d = (res as any)?.data as DefectTraceResponse | null;
      if (!d) { setError('未找到该订单的扫码质量数据'); return; }
      setData(d);
    } catch {
      setError('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fmtRate = (r: number) => `${(r * 100).toFixed(1)}%`;

  return (
    <div className="c-card">
      <div className="c-card-title">
        <BugOutlined /> 次品溯源分析
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
          溯源
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          {/* 汇总指标 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: '总扫码次数', value: data.totalScans },
              { label: '次品数', value: data.totalDefects },
              {
                label: '整体次品率',
                value: fmtRate(data.overallDefectRate),
                color: data.overallDefectRate > 0.05 ? '#ff4136' : data.overallDefectRate > 0.02 ? '#f7a600' : '#39ff14',
              },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: (item as any).color ?? 'var(--text-primary)',
                }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 工序热点 */}
          {data.hotProcesses?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>⚡ 高风险工序</div>
              {data.hotProcesses.slice(0, 5).map(p => (
                <div key={p.processName} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 100, fontSize: 12, color: 'var(--text-primary)' }}>{p.processName}</span>
                  <Progress
                    percent={Math.round(p.defectRate * 100)}
                    size="small"
                    style={{ flex: 1 }}
                    strokeColor={p.defectRate > 0.05 ? '#ff4136' : p.defectRate > 0.02 ? '#f7a600' : '#39ff14'}
                    format={pct => `${pct}%`}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 50 }}>
                    {p.defectCount}/{p.totalScans}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 工人缺陷表 */}
          {data.workers?.length > 0 && (
            <Table
              size="small"
              rowKey="operatorId"
              dataSource={data.workers}
              pagination={{ pageSize: 5, size: 'small' }}
              columns={[
                { title: '工人', dataIndex: 'operatorName', width: 100 },
                { title: '次品/总扫', render: (_, r) => `${r.defectCount}/${r.totalScans}`, width: 90 },
                {
                  title: '次品率', dataIndex: 'defectRate', width: 80,
                  render: (v: number) => (
                    <span style={{ color: v > 0.05 ? '#ff4136' : v > 0.02 ? '#f7a600' : '#39ff14' }}>
                      {fmtRate(v)}
                    </span>
                  ),
                },
                { title: '高发工序', dataIndex: 'worstProcess', ellipsis: true },
                {
                  title: '风险', dataIndex: 'riskLevel', width: 60,
                  render: (v: string) => <Tag color={riskColor[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag>,
                },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
};

export default DefectTracePanel;
