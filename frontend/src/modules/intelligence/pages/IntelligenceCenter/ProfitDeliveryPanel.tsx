import React, { useState, useCallback } from 'react';
import { Input, Button, Tag } from 'antd';
import { DollarOutlined, SearchOutlined, CalendarOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { ProfitEstimationResponse, DeliveryPredictionResponse } from '@/services/production/productionApi';

const profitStatusColor: Record<string, string> = {
  EXCELLENT: '#39ff14',
  GOOD: '#00e5ff',
  NORMAL: '#f7a600',
  LOW: '#ff8c00',
  LOSS: '#ff4136',
};
const profitStatusLabel: Record<string, string> = {
  EXCELLENT: '优盈', GOOD: '良好', NORMAL: '一般', LOW: '偏低', LOSS: '亏损',
};

/** 利润估算 + 交期预测面板（合二为一，同一订单ID查询） */
const ProfitDeliveryPanel: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [profit, setProfit] = useState<ProfitEstimationResponse | null>(null);
  const [delivery, setDelivery] = useState<DeliveryPredictionResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const id = orderId.trim();
    if (!id) return;
    setLoading(true);
    setError('');
    setProfit(null);
    setDelivery(null);
    try {
      const [rProfit, rDelivery] = await Promise.allSettled([
        intelligenceApi.estimateProfit({ orderId: id }),
        intelligenceApi.predictDelivery({ orderId: id }),
      ]);
      const p: ProfitEstimationResponse | null = rProfit.status === 'fulfilled'
        ? ((rProfit.value as any)?.data ?? null) : null;
      const d: DeliveryPredictionResponse | null = rDelivery.status === 'fulfilled'
        ? ((rDelivery.value as any)?.data ?? null) : null;
      setProfit(p);
      setDelivery(d);
      if (!p && !d) setError('暂无该订单的估算数据（需要有扫码及结算历史）');
    } catch {
      setError('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const pct = profit?.grossMarginPct ?? 0;
  const pColor = profitStatusColor[profit?.profitStatus ?? ''] ?? '#888';

  return (
    <div className="c-card">
      <div className="c-card-title">
        <DollarOutlined style={{ marginRight: 6, color: '#ffd700' }} />
        订单利润估算&nbsp;&amp;&nbsp;完工预测
        <span className="c-card-badge" style={{ background: 'rgba(255,215,0,0.12)', color: '#ffd700', borderColor: '#ffd700' }}>
          AI 双引擎分析
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a6d8a' }}>
          输入订单ID → 利润拆解 + 三场景完工日期
        </span>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#4a6d8a' }} />}
          placeholder="输入订单 ID（数字）"
          value={orderId}
          onChange={e => setOrderId(e.target.value.replace(/[^\d]/g, ''))}
          onPressEnter={handleSearch}
          style={{
            width: 220,
            background: 'rgba(255,215,0,0.05)',
            border: '1px solid rgba(255,215,0,0.2)',
            color: '#e2f0ff',
          }}
        />
        <Button
          type="primary"
          loading={loading}
          onClick={handleSearch}
          style={{ background: 'rgba(255,215,0,0.15)', borderColor: 'rgba(255,215,0,0.4)', color: '#ffd700' }}
          icon={<DollarOutlined />}
        >
          分析
        </Button>
      </div>

      {error && <div className="c-empty" style={{ color: '#f7a600' }}>{error}</div>}
      {!profit && !delivery && !loading && !error && (
        <div className="c-empty">输入订单ID查询，AI将拆解利润构成并预测完工日期</div>
      )}

      {/* 两列布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* 利润估算 */}
        {profit && (
          <div style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ color: '#4a6d8a', fontSize: 12, marginBottom: 10 }}>
              <DollarOutlined style={{ marginRight: 4 }} />
              利润估算 — <b style={{ color: '#e2f0ff' }}>{profit.orderNo}</b>
              <Tag style={{ marginLeft: 8, background: `${pColor}22`, color: pColor, borderColor: pColor, fontSize: 11 }}>
                {profitStatusLabel[profit.profitStatus] ?? profit.profitStatus}
              </Tag>
            </div>

            {/* 毛利率进度条 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#4a6d8a' }}>毛利率</span>
                <b style={{ color: pColor, fontSize: 16 }}>{pct.toFixed(1)}%</b>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                  height: '100%', background: pColor, borderRadius: 3,
                  transition: 'width 0.8s ease',
                }} />
              </div>
            </div>

            {/* 成本拆解 */}
            {[
              { label: '营业收入', val: profit.revenue,      color: '#39ff14' },
              { label: '物料成本', val: profit.materialCost, color: '#ff4136' },
              { label: '人工成本', val: profit.laborCost,    color: '#f7a600' },
              { label: '管理成本', val: profit.overheadCost, color: '#a78bfa' },
              { label: '总成本',   val: profit.totalCost,    color: '#4a6d8a' },
              { label: '毛利润',   val: profit.grossProfit,  color: pColor },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                <span style={{ color: '#4a6d8a' }}>{label}</span>
                <b style={{ color }}>{val >= 0 ? '' : '-'}¥{Math.abs(val).toLocaleString()}</b>
              </div>
            ))}
          </div>
        )}

        {/* 交期预测 */}
        {delivery && (
          <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ color: '#4a6d8a', fontSize: 12, marginBottom: 10 }}>
              <CalendarOutlined style={{ marginRight: 4 }} />
              完工预测 — <b style={{ color: '#e2f0ff' }}>{delivery.orderNo}</b>
            </div>

            {/* 三场景日期 */}
            {[
              { label: '乐观完工', date: delivery.optimisticDate, color: '#39ff14' },
              { label: '预计完工', date: delivery.realisticDate,  color: '#00e5ff' },
              { label: '悲观完工', date: delivery.pessimisticDate, color: '#ff4136' },
            ].map(({ label, date, color }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 8, padding: '6px 10px',
                background: `${color}11`, borderRadius: 6, border: `1px solid ${color}33`,
              }}>
                <span style={{ color: '#4a6d8a', fontSize: 12 }}>{label}</span>
                <b style={{ color, fontSize: 14 }}>{date?.slice(0, 10) ?? '—'}</b>
              </div>
            ))}

            {/* 辅助信息 */}
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4a6d8a' }}>日均生产速度</span>
                <b style={{ color: '#00e5ff' }}>{delivery.dailyVelocity} 件/天</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4a6d8a' }}>剩余件数</span>
                <b style={{ color: '#e2f0ff' }}>{delivery.remainingQty.toLocaleString()} 件</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4a6d8a' }}>AI 置信度</span>
                <b style={{ color: delivery.confidence >= 0.7 ? '#39ff14' : '#f7a600' }}>
                  {(delivery.confidence * 100).toFixed(0)}%
                </b>
              </div>
            </div>

            {delivery.rationale && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,229,255,0.06)', borderRadius: 6, fontSize: 11, color: '#4a6d8a', lineHeight: 1.6 }}>
                💡 {delivery.rationale}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfitDeliveryPanel;
