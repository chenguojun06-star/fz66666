import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { AuditOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { FinanceAuditResponse } from '@/services/intelligence/intelligenceApi';

const riskColor: Record<string, string> = {
  HIGH: '#ff4136', MEDIUM: '#f7a600', LOW: '#39ff14',
  高: '#ff4136', 中: '#f7a600', 低: '#39ff14',
};

/** 财务审核智能分析面板 */
const FinanceAuditPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinanceAuditResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getFinanceAudit();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const overallColor = riskColor[data?.overallRisk ?? ''] ?? '#888';
  const fmt = (v: number | undefined) =>
    v == null ? '—' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><AuditOutlined /> 财务审核智能分析</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '开始分析'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          {/* 总览 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '分析订单数', value: data.summary?.totalOrders ?? 0 },
              { label: '入库数量', value: data.summary?.totalWarehousedQty ?? 0 },
              { label: '结算金额', value: fmt(data.summary?.totalSettlementAmount) },
              { label: '异常订单', value: data.summary?.anomalyCount ?? 0 },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 整体风险 + 建议 */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14,
            background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px',
          }}>
            <div style={{ textAlign: 'center', minWidth: 64 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>整体风险</div>
              <Tag color={overallColor} style={{ marginTop: 4, fontSize: 14, padding: '2px 10px' }}>
                {data.overallRisk}
              </Tag>
            </div>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
              <ExclamationCircleOutlined style={{ color: overallColor, marginRight: 6 }} />
              {data.suggestionText || data.suggestion}
            </div>
          </div>

          {/* 利润分析 */}
          {data.profitAnalysis && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { label: '平均利润率', value: `${data.profitAnalysis.avgProfitMargin?.toFixed(1)}%` },
                { label: '负利润', value: `${data.profitAnalysis.negativeCount} 单`, color: '#ff4136' },
                { label: '利润异常高', value: `${data.profitAnalysis.abnormalHighCount} 单`, color: '#f7a600' },
                { label: '低利润', value: `${data.profitAnalysis.lowProfitCount} 单`, color: '#f7a600' },
                { label: '正常', value: `${data.profitAnalysis.normalCount} 单`, color: '#39ff14' },
              ].map(c => (
                <span key={c.label} style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '3px 10px',
                  fontSize: 12, color: c.color ?? 'var(--text-primary)',
                }}>
                  {c.label}：{c.value}
                </span>
              ))}
            </div>
          )}

          {/* 异常发现 */}
          {data.findings?.length > 0 && (
            <Table
              size="small"
              rowKey={(r, i) => `${r.orderNo}-${i}`}
              dataSource={data.findings.slice(0, 10)}
              pagination={false}
              columns={[
                {
                  title: '风险', dataIndex: 'riskLevel', width: 60,
                  render: (v: string) => <Tag color={riskColor[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag>,
                },
                { title: '订单号', dataIndex: 'orderNo', width: 140 },
                { title: '类型', dataIndex: 'type', width: 100 },
                { title: '说明', dataIndex: 'description' },
                { title: '金额', dataIndex: 'amount', width: 100, render: fmt },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
};

export default FinanceAuditPanel;
