import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Tooltip } from 'antd';
import { ReloadOutlined, ExperimentOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { RhythmDnaResponse, OrderRhythm, RhythmSegment } from '@/services/production/productionApi';

const DnaStrip: React.FC<{ order: OrderRhythm }> = ({ order }) => {
  const total = order.segments.reduce((s, seg) => s + seg.pct, 0) || 1;
  return (
    <div className="dna-row">
      <div className="dna-order-no" title={order.orderId}>{order.orderNo || order.orderId}</div>
      <div className="dna-strip">
        {order.segments.map((seg, i) => (
          <Tooltip key={i} title={`${seg.stageName}: ${seg.days}天 (${seg.pct.toFixed(0)}%)${seg.bottleneck ? ' ⚠ 瓶颈' : ''}`}>
            <div
              className={`dna-segment ${seg.bottleneck ? 'bottleneck' : ''}`}
              style={{
                width: `${(seg.pct / total) * 100}%`,
                background: seg.color || '#d9d9d9',
              }}
            >
              {seg.pct > 10 && <span className="dna-seg-label">{seg.stageName}</span>}
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

const RhythmDnaPanel: React.FC = () => {
  const [data, setData] = useState<RhythmDnaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getRhythmDna() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // 图例
  const legendColors = data?.orders?.[0]?.segments?.map(s => ({ name: s.stageName, color: s.color })) ?? [];

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>
          <ExperimentOutlined style={{ color: '#722ed1', marginRight: 6 }} />
          生产节奏 DNA
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {legendColors.length > 0 && (
        <div className="dna-legend">
          {legendColors.map(l => (
            <span key={l.name} className="dna-legend-item">
              <span className="dna-legend-dot" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
          <span className="dna-legend-item">
            <span className="dna-legend-dot bottleneck-dot" />
            瓶颈工序
          </span>
        </div>
      )}

      <Spin spinning={loading}>
        {data?.orders?.length ? (
          <div className="dna-container">
            {data.orders.map(o => <DnaStrip key={o.orderId} order={o} />)}
          </div>
        ) : !loading && <Empty description="暂无订单节奏数据" />}
      </Spin>
    </div>
  );
};

export default RhythmDnaPanel;
