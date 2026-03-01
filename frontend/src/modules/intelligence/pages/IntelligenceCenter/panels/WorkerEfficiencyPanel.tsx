import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Tag, Table } from 'antd';
import { ReloadOutlined, StarFilled } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { WorkerEfficiencyResponse, WorkerEfficiencyItem } from '@/services/production/productionApi';

const dims = [
  { key: 'speedScore', label: '速度', color: '#1677ff' },
  { key: 'qualityScore', label: '质量', color: '#52c41a' },
  { key: 'stabilityScore', label: '稳定', color: '#722ed1' },
  { key: 'versatilityScore', label: '全能', color: '#fa8c16' },
  { key: 'attendanceScore', label: '出勤', color: '#13c2c2' },
] as const;

const RadarMini: React.FC<{ worker: WorkerEfficiencyItem }> = ({ worker }) => {
  const size = 80;
  const cx = size / 2, cy = size / 2, r = 30;
  const points = dims.map((d, i) => {
    const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
    const val = (worker[d.key] ?? 0) / 100;
    return { x: cx + r * val * Math.cos(angle), y: cy + r * val * Math.sin(angle) };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s} points={dims.map((_, i) => {
          const a = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
          return `${cx + r * s * Math.cos(a)},${cy + r * s * Math.sin(a)}`;
        }).join(' ')} fill="none" stroke="#e8e8e8" strokeWidth={0.5} />
      ))}
      <polygon points={path.replace(/[MLZ]/g, m => m === 'Z' ? '' : '').trim().replace(/L/g, ' ')} fill="rgba(22,119,255,0.15)" stroke="#1677ff" strokeWidth={1.5} />
    </svg>
  );
};

const trendTag: Record<string, { color: string; text: string }> = {
  rising: { color: 'green', text: '↑ 上升' },
  stable: { color: 'blue', text: '→ 稳定' },
  declining: { color: 'red', text: '↓ 下滑' },
};

const columns = [
  {
    title: '雷达', key: 'radar', width: 90,
    render: (_: unknown, r: WorkerEfficiencyItem) => <RadarMini worker={r} />,
  },
  { title: '姓名', dataIndex: 'operatorName', key: 'operatorName', width: 80 },
  {
    title: '综合分', dataIndex: 'overallScore', key: 'overallScore', width: 80,
    render: (v: number) => <span style={{ fontSize: 18, fontWeight: 700, color: v >= 80 ? '#52c41a' : v >= 60 ? '#1677ff' : '#ff4d4f' }}>{v}</span>,
    sorter: (a: WorkerEfficiencyItem, b: WorkerEfficiencyItem) => a.overallScore - b.overallScore,
    defaultSortOrder: 'descend' as const,
  },
  ...dims.map(d => ({
    title: d.label,
    dataIndex: d.key,
    key: d.key,
    width: 70,
    render: (v: number) => (
      <div className="score-bar-container">
        <div className="score-bar" style={{ width: `${v}%`, background: d.color }} />
        <span className="score-bar-text">{v}</span>
      </div>
    ),
  })),
  { title: '擅长', dataIndex: 'bestProcess', key: 'bestProcess', width: 80 },
  {
    title: '日均', dataIndex: 'dailyAvgOutput', key: 'dailyAvgOutput', width: 70,
    render: (v: number) => `${v}件`,
  },
  {
    title: '趋势', dataIndex: 'trend', key: 'trend', width: 80,
    render: (t: string) => {
      const tag = trendTag[t] || trendTag.stable;
      return <Tag color={tag.color}>{tag.text}</Tag>;
    },
  },
];

const WorkerEfficiencyPanel: React.FC = () => {
  const [data, setData] = useState<WorkerEfficiencyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getWorkerEfficiency() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const top3 = data?.workers?.slice(0, 3) ?? [];

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}><StarFilled style={{ color: '#faad14', marginRight: 6 }} />工人效率画像</span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {top3.length > 0 && (
        <div className="efficiency-podium">
          {top3.map((w, i) => (
            <div key={w.operatorName} className={`podium-item rank-${i + 1}`}>
              <RadarMini worker={w} />
              <div className="podium-name">{w.operatorName}</div>
              <div className="podium-score">{w.overallScore}分</div>
            </div>
          ))}
        </div>
      )}

      <Spin spinning={loading}>
        {data?.workers?.length ? (
          <Table
            rowKey="operatorName"
            columns={columns}
            dataSource={data.workers}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            size="small"
            scroll={{ x: 900 }}
          />
        ) : !loading && <Empty description="暂无工人数据" />}
      </Spin>
    </div>
  );
};

export default WorkerEfficiencyPanel;
