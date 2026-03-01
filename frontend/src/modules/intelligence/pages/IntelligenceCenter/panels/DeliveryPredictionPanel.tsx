import React, { useState, useCallback } from 'react';
import { Input, Button, Spin, Empty, Alert, Tag, Progress } from 'antd';
import { RocketOutlined, SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { DeliveryPredictionResponse } from '@/services/production/productionApi';

const DeliveryPredictionPanel: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [data, setData] = useState<DeliveryPredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!orderId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.predictDelivery({ orderId: orderId.trim() }) as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '预测失败');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const confidenceColor = (data?.confidence ?? 0) >= 80 ? '#52c41a' : (data?.confidence ?? 0) >= 50 ? '#faad14' : '#ff4d4f';

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <Input
          value={orderId}
          onChange={e => setOrderId(e.target.value)}
          placeholder="输入订单ID"
          style={{ width: 260 }}
          onPressEnter={fetch}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch} loading={loading}>预测完工日期</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data ? (
          <div className="prediction-result">
            <div className="prediction-header">
              <RocketOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>订单 {data.orderNo}</div>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>剩余 {data.remainingQty} 件 · 日均速度 {data.dailyVelocity} 件/天</div>
              </div>
            </div>

            <div className="prediction-dates">
              <div className="date-card optimistic">
                <div className="date-label">🟢 乐观</div>
                <div className="date-value">{data.optimisticDate}</div>
              </div>
              <div className="date-card realistic">
                <div className="date-label">🔵 最可能</div>
                <div className="date-value">{data.realisticDate}</div>
              </div>
              <div className="date-card pessimistic">
                <div className="date-label">🔴 悲观</div>
                <div className="date-value">{data.pessimisticDate}</div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13 }}>预测置信度</span>
              <Progress percent={data.confidence} strokeColor={confidenceColor} style={{ flex: 1 }} />
            </div>

            <div className="prediction-rationale">
              <Tag color="blue">分析依据</Tag>
              {data.rationale}
            </div>
          </div>
        ) : !loading && <Empty description="输入订单ID后点击预测" />}
      </Spin>
    </div>
  );
};

export default DeliveryPredictionPanel;
