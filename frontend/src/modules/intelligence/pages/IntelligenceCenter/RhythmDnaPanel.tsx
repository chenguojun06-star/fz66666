import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'antd';
import { RadarChartOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { RhythmDnaResponse, OrderRhythm, RhythmSegment } from '@/services/production/productionApi';

const DEFAULT_COLORS = ['#00e5ff', '#a78bfa', '#39ff14', '#f7a600', '#ff4136', '#ffd700', '#ff8c00'];

/** 生产节奏DNA 面板（按订单横向甘特色块） */
const RhythmDnaPanel: React.FC = () => {
  const [data, setData] = useState<RhythmDnaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getRhythmDna() as any;
      setData(res?.data ?? res ?? null);
    } catch {
      setError('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const orders: OrderRhythm[] = data?.orders ?? [];

  const segColor = (seg: RhythmSegment, idx: number) => {
    if (seg.color && seg.color !== '#ffffff' && seg.color !== 'white') return seg.color;
    return DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
  };

  return (
    <div className="c-card">
      <div className="c-card-title">
        <RadarChartOutlined style={{ marginRight: 6, color: '#a78bfa' }} />
        生产节奏 DNA
        <span className="c-card-badge" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderColor: '#a78bfa' }}>
          工序时长分布可视化
        </span>
        <button
          className="c-suggest-btn"
          style={{ marginLeft: 'auto', borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa' }}
          onClick={load}
          disabled={loading}
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#4a6d8a', marginBottom: 12 }}>
        每行 = 一个订单，色块宽度代表各工序天数占比，鼠标悬停查看详情。
        <span style={{ marginLeft: 8, color: '#ff4136' }}>🔴 = 瓶颈工序</span>
      </div>

      {error && <div className="c-empty" style={{ color: '#f7a600' }}>{error}</div>}
      {loading && <div className="c-empty">AI 正在分析生产节奏数据…</div>}

      {!loading && orders.length === 0 && !error && (
        <div className="c-empty">暂无足够历史数据，需要多个订单完成扫码后才能分析节奏</div>
      )}

      {orders.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 480 }}>
            {orders.slice(0, 12).map(order => (
              <div key={order.orderId} style={{ marginBottom: 10 }}>
                {/* 订单标题行 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                  <span style={{ color: '#e2f0ff', fontWeight: 600 }}>{order.orderNo}</span>
                  <span style={{ color: '#4a6d8a' }}>
                    {order.segments?.reduce((s, seg) => s + seg.days, 0)} 天
                  </span>
                </div>
                {/* DNA 横向条 */}
                <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                  {order.segments?.map((seg, i) => {
                    const col = segColor(seg, i);
                    const isBottleneck = seg.bottleneck;
                    return (
                      <Tooltip
                        key={seg.stageName}
                        title={
                          <div style={{ fontSize: 12 }}>
                            <div><b>{seg.stageName}</b></div>
                            <div>用时：{seg.days} 天（{seg.pct.toFixed(0)}%）</div>
                            {isBottleneck && <div style={{ color: '#ff4136' }}>⚠ 生产瓶颈工序</div>}
                          </div>
                        }
                      >
                        <div style={{
                          flex: seg.pct,
                          minWidth: 4,
                          background: isBottleneck ? '#ff4136' : col,
                          opacity: isBottleneck ? 1 : 0.85,
                          cursor: 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'opacity 0.2s',
                          boxShadow: isBottleneck ? `0 0 8px #ff413666` : 'none',
                        }}>
                          {seg.pct >= 12 && (
                            <span style={{
                              fontSize: 10, color: '#fff',
                              fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden',
                            }}>
                              {seg.stageName}
                            </span>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
                {/* 工序标签（仅当 pct 小、无法显示在块内时补充） */}
                {order.segments?.some(s => s.pct < 12) && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    {order.segments.filter(s => s.pct < 12).map((seg, i) => {
                      const col = segColor(seg, i);
                      return (
                        <span key={seg.stageName} style={{ fontSize: 10, color: col }}>
                          ■ {seg.stageName} ({seg.days}天)
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {orders.length > 12 && (
              <div style={{ fontSize: 11, color: '#4a6d8a', textAlign: 'center', marginTop: 8 }}>
                已显示最近 12 条，共 {orders.length} 条历史记录
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RhythmDnaPanel;
