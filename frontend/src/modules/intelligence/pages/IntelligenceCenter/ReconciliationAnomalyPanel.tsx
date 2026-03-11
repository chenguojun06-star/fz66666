import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { AuditOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ReconciliationAnomalyResponse } from '@/services/intelligence/intelligenceApi';

const anomalyTypeLabel: Record<string, string> = {
  high_deduction: '高扣款', low_profit: '低毛利', overdue_pending: '逾期待结',
};
const anomalyTypeColor: Record<string, string> = {
  high_deduction: 'orange', low_profit: 'red', overdue_pending: 'purple',
};

const ReconciliationAnomalyPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReconciliationAnomalyResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getReconciliationAnomalyPriority();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    { title: '对账单号', dataIndex: 'reconciliationNo', key: 'reconciliationNo', width: 140 },
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 130 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110 },
    {
      title: '异常类型',
      dataIndex: 'anomalyType',
      key: 'anomalyType',
      width: 90,
      render: (v: string) =>
        <Tag color={anomalyTypeColor[v] ?? 'default'}>{anomalyTypeLabel[v] ?? v}</Tag>,
    },
    {
      title: '扣款金额',
      dataIndex: 'deductionAmount',
      key: 'deductionAmount',
      width: 90,
      render: (v: number) => v > 0 ? <span style={{ color: '#ff4136' }}>-¥{v.toFixed(2)}</span> : '—',
    },
    {
      title: '毛利率',
      dataIndex: 'profitMarginPct',
      key: 'profitMarginPct',
      width: 80,
      render: (v: number) => v == null ? '—' : <span style={{ color: v < 5 ? '#ff4136' : 'inherit' }}>{v.toFixed(1)}%</span>,
    },
    {
      title: '待处理天数',
      dataIndex: 'pendingDays',
      key: 'pendingDays',
      width: 90,
      render: (v: number) => <span style={{ color: v > 7 ? '#ff4136' : v > 3 ? '#f7a600' : 'inherit' }}>{v}天</span>,
    },
    {
      title: '优先分',
      dataIndex: 'priorityScore',
      key: 'priorityScore',
      width: 75,
      sorter: (a: any, b: any) => b.priorityScore - a.priorityScore,
      render: (v: number) => <span style={{ fontWeight: 600, color: v > 50 ? '#ff4136' : v > 20 ? '#f7a600' : 'inherit' }}>{v.toFixed(1)}</span>,
    },
    { title: '处理建议', dataIndex: 'advice', key: 'advice', ellipsis: true },
  ];

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><AuditOutlined /> 对账异常优先级</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '开始分析'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '检查对账单数', value: data.totalChecked },
              { label: '检出异常', value: data.anomalyCount, danger: data.anomalyCount > 0 },
              {
                label: '高优先级（>50分）',
                value: data.items?.filter(a => a.priorityScore > 50).length ?? 0,
                danger: true,
              },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: item.danger && item.value > 0 ? '#ff4136' : 'inherit' }}>{item.value}</div>
              </div>
            ))}
          </div>
          <Table
            dataSource={data.items ?? []}
            columns={columns}
            rowKey="reconciliationNo"
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 880 }}
          />
        </>
      )}
    </div>
  );
};

export default ReconciliationAnomalyPanel;
