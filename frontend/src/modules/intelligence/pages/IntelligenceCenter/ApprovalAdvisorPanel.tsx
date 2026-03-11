import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { SafetyOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ApprovalAdvisorResponse } from '@/services/intelligence/intelligenceApi';

const verdictColor: Record<string, string> = {
  APPROVE: 'success', REJECT: 'error', ESCALATE: 'warning',
};
const verdictLabel: Record<string, string> = {
  APPROVE: '建议通过', REJECT: '建议拒绝', ESCALATE: '建议上报',
};
const riskLevelColor: Record<string, string> = {
  low: 'blue', medium: 'orange', high: 'red',
};
const riskLevelLabel: Record<string, string> = {
  low: '低风险', medium: '中风险', high: '高风险',
};
const opTypeLabel: Record<string, string> = {
  ORDER_DELETE: '删除订单', ORDER_MODIFY: '修改订单',
  STYLE_DELETE: '删除款式', SAMPLE_DELETE: '删除样板',
  SCAN_UNDO: '撤回扫码',
};

const ApprovalAdvisorPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApprovalAdvisorResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getApprovalAiAdvice();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    {
      title: '操作类型',
      dataIndex: 'operationType',
      key: 'operationType',
      width: 100,
      render: (v: string) => opTypeLabel[v] ?? v,
    },
    { title: '目标单号', dataIndex: 'targetNo', key: 'targetNo', width: 130 },
    { title: '申请人', dataIndex: 'applicantName', key: 'applicantName', width: 90 },
    { title: '部门', dataIndex: 'orgUnitName', key: 'orgUnitName', width: 100 },
    {
      title: '待审时长',
      dataIndex: 'pendingHours',
      key: 'pendingHours',
      width: 85,
      render: (v: number) =>
        <span style={{ color: v >= 48 ? '#ff4136' : v >= 24 ? '#f7a600' : 'inherit' }}>{v}小时</span>,
    },
    {
      title: 'AI建议',
      dataIndex: 'verdict',
      key: 'verdict',
      width: 100,
      render: (v: string) =>
        <Tag color={verdictColor[v] ?? 'default'}>{verdictLabel[v] ?? v}</Tag>,
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 80,
      render: (v: string) =>
        <Tag color={riskLevelColor[v] ?? 'default'}>{riskLevelLabel[v] ?? v}</Tag>,
    },
    { title: '建议理由', dataIndex: 'verdictReason', key: 'verdictReason', ellipsis: true },
  ];

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><SafetyOutlined /> 审批AI建议</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '获取建议'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '待审批总数', value: data.pendingCount },
              { label: '高风险操作', value: data.highRiskCount, danger: data.highRiskCount > 0 },
              {
                label: '建议拒绝',
                value: data.items?.filter(a => a.verdict === 'REJECT').length ?? 0,
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
            rowKey={(r) => r.approvalId}
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 880 }}
          />
        </>
      )}
    </div>
  );
};

export default ApprovalAdvisorPanel;
