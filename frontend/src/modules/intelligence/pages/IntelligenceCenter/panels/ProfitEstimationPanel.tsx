import React, { useState, useCallback } from 'react';
import { Input, Button, Spin, Empty, Alert, Tag } from 'antd';
import { DollarOutlined, SearchOutlined, RobotOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { ProfitEstimationResponse } from '@/services/production/productionApi';

const statusTag: Record<string, { color: string; text: string }> = {
  profitable: { color: 'green', text: '盈利' },
  marginal: { color: 'orange', text: '微利' },
  loss: { color: 'red', text: '亏损' },
};

const ProfitEstimationPanel: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [data, setData] = useState<ProfitEstimationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleAiAdvice = async () => {
    if (!data) return;
    setAiLoading(true);
    setAiAdvice('');
    setAiError('');
    try {
      const statusMap: Record<string, string> = { profitable: '盈利', marginal: '微利', loss: '亏损' };
      const question = `订单${data.orderNo}：毛利率${data.grossMarginPct.toFixed(1)}%（${statusMap[data.profitStatus] || data.profitStatus}），营收${data.revenue.toFixed(0)}元，面料成本${data.materialCost.toFixed(0)}元，人工${data.laborCost.toFixed(0)}元，管理费${data.overheadCost.toFixed(0)}元，毛利${data.grossProfit.toFixed(0)}元。分析盈利风险并给出2-3条改善建议。`;
      const res = await intelligenceApi.aiAdvisorChat(question) as any;
      const answer = res?.data?.answer || res?.answer || '';
      answer ? setAiAdvice(answer) : setAiError('未收到 AI 回复，请稍后重试');
    } catch (e: any) {
      setAiError(e?.message || 'AI 请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  const fetch = useCallback(async () => {
    if (!orderId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.estimateProfit({ orderId: orderId.trim() }) as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '预估失败');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fmt = (v: number) => `¥${(v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch} loading={loading}>利润预估</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data ? (
          <div className="profit-result">
            <div className="profit-header">
              <DollarOutlined style={{ fontSize: 28, color: data.grossMarginPct >= 20 ? '#52c41a' : data.grossMarginPct >= 0 ? '#faad14' : '#ff4d4f' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>订单 {data.orderNo}</div>
                <Tag color={statusTag[data.profitStatus]?.color ?? 'default'}>
                  {statusTag[data.profitStatus]?.text ?? data.profitStatus}
                </Tag>
              </div>
              <div className="profit-margin">
                <div className="margin-value" style={{ color: data.grossMarginPct >= 0 ? '#52c41a' : '#ff4d4f' }}>
                  {data.grossMarginPct.toFixed(1)}%
                </div>
                <div className="margin-label">毛利率</div>
              </div>
            </div>

            {/* 瀑布图风格 */}
            <div className="profit-waterfall">
              <div className="waterfall-item revenue">
                <div className="wf-label">营收</div>
                <div className="wf-bar" style={{ height: 100 }} />
                <div className="wf-value">{fmt(data.revenue)}</div>
              </div>
              <div className="waterfall-item cost">
                <div className="wf-label">面料</div>
                <div className="wf-bar" style={{ height: Math.max(8, (data.materialCost / Math.max(data.revenue, 1)) * 100) }} />
                <div className="wf-value">-{fmt(data.materialCost)}</div>
              </div>
              <div className="waterfall-item cost">
                <div className="wf-label">人工</div>
                <div className="wf-bar" style={{ height: Math.max(8, (data.laborCost / Math.max(data.revenue, 1)) * 100) }} />
                <div className="wf-value">-{fmt(data.laborCost)}</div>
              </div>
              <div className="waterfall-item cost">
                <div className="wf-label">管理</div>
                <div className="wf-bar" style={{ height: Math.max(8, (data.overheadCost / Math.max(data.revenue, 1)) * 100) }} />
                <div className="wf-value">-{fmt(data.overheadCost)}</div>
              </div>
              <div className={`waterfall-item ${data.grossProfit >= 0 ? 'profit' : 'loss'}`}>
                <div className="wf-label">利润</div>
                <div className="wf-bar" style={{ height: Math.max(8, Math.abs(data.grossProfit / Math.max(data.revenue, 1)) * 100) }} />
                <div className="wf-value">{fmt(data.grossProfit)}</div>
              </div>
            </div>
          </div>
        ) : !loading && <Empty description="输入订单ID后点击预估" />}
      </Spin>
      {data && (
        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Button icon={<RobotOutlined />} loading={aiLoading} onClick={handleAiAdvice} type="primary" ghost size="small">
            AI 盈利分析
          </Button>
          {aiError && <Alert type="error" message={aiError} showIcon style={{ marginTop: 10 }} />}
          {aiAdvice && !aiError && (
            <Alert type="info" message="AI 利润风险分析"
              description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{aiAdvice}</pre>}
              showIcon icon={<RobotOutlined />} style={{ marginTop: 10 }} />
          )}
        </div>
      )}
    </div>
  );
};

export default ProfitEstimationPanel;
