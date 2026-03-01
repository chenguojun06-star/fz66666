import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Statistic, Tag } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { LivePulseResponse } from '@/services/production/productionApi';

const LivePulsePanel: React.FC = () => {
  const [data, setData] = useState<LivePulseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getLivePulse() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const timer = setInterval(fetch, 30000);
    return () => clearInterval(timer);
  }, [fetch]);

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span className="pulse-live-badge">
          <span className="pulse-dot" /> LIVE
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data ? (
          <>
            <div className="stat-row">
              <div className="stat-card pulse-stat">
                <Statistic title="活跃工厂" value={data.activeFactories} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#1677ff' }} />
              </div>
              <div className="stat-card pulse-stat">
                <Statistic title="在线工人" value={data.activeWorkers} valueStyle={{ color: '#52c41a' }} />
              </div>
              <div className="stat-card pulse-stat">
                <Statistic title="今日扫码" value={data.todayScanQty} suffix="件" valueStyle={{ color: '#722ed1' }} />
              </div>
              <div className="stat-card pulse-stat">
                <Statistic title="每小时速率" value={data.scanRatePerHour} suffix="次/h" valueStyle={{ color: '#fa8c16' }} />
              </div>
            </div>

            {/* 时间线 */}
            <div className="pulse-timeline-title">2小时脉搏波形</div>
            <div className="pulse-timeline">
              {data.timeline?.map((p, i) => {
                const max = Math.max(...data.timeline.map(t => t.count), 1);
                const h = Math.max(4, (p.count / max) * 80);
                return (
                  <div key={i} className="pulse-bar-wrap" title={`${p.time}: ${p.count}次`}>
                    <div className="pulse-bar" style={{ height: h }} />
                    {i % 3 === 0 && <span className="pulse-bar-label">{p.time?.slice(-5)}</span>}
                  </div>
                );
              })}
            </div>

            {/* 停滞工厂 */}
            {data.stagnantFactories?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#ff4d4f' }}>⚠ 停滞工厂</div>
                {data.stagnantFactories.map((f, i) => (
                  <Tag key={i} color="red" style={{ marginBottom: 4 }}>
                    {f.factoryName} — 静默 {f.minutesSilent} 分钟
                  </Tag>
                ))}
              </div>
            )}
          </>
        ) : !loading && <Empty description="暂无数据" />}
      </Spin>
    </div>
  );
};

export default LivePulsePanel;
