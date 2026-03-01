import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Alert, Spin, Empty } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { DeliveryRiskResponse, DeliveryRiskItem } from '@/services/production/productionApi';

const riskTag: Record<string, { color: string; text: string }> = {
  overdue: { color: 'red', text: '已逾期' },
  danger: { color: 'volcano', text: '高风险' },
  warning: { color: 'orange', text: '需关注' },
  safe: { color: 'green', text: '安全' },
};

const columns = [
  { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
  { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
  { title: '工厂', dataIndex: 'factoryName', key: 'factoryName', width: 100, ellipsis: true },
  {
    title: '风险', dataIndex: 'riskLevel', key: 'riskLevel', width: 90,
    render: (r: string) => {
      const t = riskTag[r] || riskTag.safe;
      return <Tag color={t.color}>{t.text}</Tag>;
    },
    sorter: (a: DeliveryRiskItem, b: DeliveryRiskItem) => {
      const order = { overdue: 0, danger: 1, warning: 2, safe: 3 };
      return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
    },
    defaultSortOrder: 'ascend' as const,
  },
  {
    title: '当前进度', dataIndex: 'currentProgress', key: 'currentProgress', width: 90,
    render: (v: number) => `${v}%`,
  },
  {
    title: '剩余天数', dataIndex: 'daysLeft', key: 'daysLeft', width: 90,
    render: (v: number) => <span className={v <= 0 ? 'risk-overdue' : v <= 3 ? 'risk-danger' : ''}>{v}天</span>,
  },
  {
    title: '预计还需', dataIndex: 'predictedDaysNeeded', key: 'predictedDaysNeeded', width: 90,
    render: (v: number) => `${v}天`,
  },
  { title: '风险说明', dataIndex: 'riskDescription', key: 'riskDescription', ellipsis: true },
];

const DeliveryRiskPanel: React.FC = () => {
  const [data, setData] = useState<DeliveryRiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.assessDeliveryRisk() as any;
      const payload: DeliveryRiskResponse | null = res?.data ?? null;
      setData(payload);
    } catch (e: any) {
      setError(e?.message || '评估失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const statItems = data ? [
    { label: '总订单', value: data.totalOrders, cls: '' },
    { label: '已逾期', value: data.overdueCount, cls: 'risk-overdue' },
    { label: '高风险', value: data.dangerCount, cls: 'risk-danger' },
    { label: '需关注', value: data.warningCount, cls: 'risk-warning' },
  ] : [];

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="stat-row">
          {statItems.map(s => (
            <div className="stat-card" key={s.label}>
              <div className={`stat-value ${s.cls}`}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data?.items?.length ? (
          <Table
            rowKey="orderId"
            columns={columns}
            dataSource={data.items}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            size="small"
            scroll={{ x: 900 }}
          />
        ) : !loading && <Empty description="暂无进行中订单" />}
      </Spin>
    </div>
  );
};

export default DeliveryRiskPanel;
