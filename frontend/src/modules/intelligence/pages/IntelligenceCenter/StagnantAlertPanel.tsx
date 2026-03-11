import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { StagnantAlertResponse } from '@/services/intelligence/intelligenceApi';

const severityColor: Record<string, string> = {
  watch: 'blue', alert: 'orange', urgent: 'red',
};
const severityLabel: Record<string, string> = {
  watch: '观察', alert: '预警', urgent: '紧急',
};

const StagnantAlertPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StagnantAlertResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getStagnantAlert();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110 },
    { title: '工厂', dataIndex: 'factoryName', key: 'factoryName', width: 100 },
    { title: '最近扫码时间', dataIndex: 'lastScanTime', key: 'lastScanTime', width: 140 },
    {
      title: '停滞天数',
      dataIndex: 'stagnantDays',
      key: 'stagnantDays',
      width: 80,
      render: (v: number) => <span style={{ color: v >= 5 ? '#ff4136' : v >= 3 ? '#f7a600' : 'inherit', fontWeight: 600 }}>{v}天</span>,
    },
    {
      title: '距截止剩余',
      dataIndex: 'daysToDeadline',
      key: 'daysToDeadline',
      width: 90,
      render: (v: number) =>
        v == null ? '—' : <span style={{ color: v <= 3 ? '#ff4136' : v <= 7 ? '#f7a600' : 'inherit' }}>{v}天</span>,
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (v: string) => <Tag color={severityColor[v] ?? 'default'}>{severityLabel[v] ?? v}</Tag>,
    },
    { title: '建议行动', dataIndex: 'actionAdvice', key: 'actionAdvice', ellipsis: true },
  ];

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><ExclamationCircleOutlined /> 停滞订单预警</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '开始检测'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '扫描订单数', value: data.checkedOrders },
              {
                label: '停滞订单',
                value: data.stagnantCount,
                danger: data.stagnantCount > 0,
              },
              {
                label: '紧急停滞',
                value: data.alerts?.filter(o => o.severity === 'urgent').length ?? 0,
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
            dataSource={data.alerts ?? []}
            columns={columns}
            rowKey="orderNo"
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 850 }}
          />
        </>
      )}
    </div>
  );
};

export default StagnantAlertPanel;
