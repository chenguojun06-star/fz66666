import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { ShoppingCartOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ReplenishmentAdvisorResponse } from '@/services/intelligence/intelligenceApi';

const urgencyColor: Record<string, string> = {
  watch: 'blue', warning: 'orange', urgent: 'red',
};
const urgencyLabel: Record<string, string> = {
  watch: '观察', warning: '预警', urgent: '紧急',
};

const ReplenishmentAdvisorPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReplenishmentAdvisorResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getReplenishmentSuggestion();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 130 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 100 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
    {
      title: '缺口数量',
      dataIndex: 'shortageQuantity',
      key: 'shortageQuantity',
      width: 80,
      render: (v: number) => <span style={{ color: '#ff4136', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '紧急程度',
      dataIndex: 'urgencyLevel',
      key: 'urgencyLevel',
      width: 85,
      sorter: (a: any, b: any) => b.urgencyScore - a.urgencyScore,
      render: (v: string) =>
        <Tag color={urgencyColor[v] ?? 'default'}>{urgencyLabel[v] ?? v}</Tag>,
    },
    { title: '推荐供应商', dataIndex: 'recommendedSupplier', key: 'recommendedSupplier', width: 120 },
    { title: '联系电话', dataIndex: 'supplierPhone', key: 'supplierPhone', width: 120 },
    {
      title: '影响订单数',
      dataIndex: 'affectedOrders',
      key: 'affectedOrders',
      width: 90,
      render: (v: number) => v > 0 ? <span style={{ color: v >= 3 ? '#ff4136' : '#f7a600' }}>{v}单</span> : '—',
    },
    { title: '采购建议', dataIndex: 'advice', key: 'advice', ellipsis: true },
  ];

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><ShoppingCartOutlined /> 补料建议</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '获取建议'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '缺料物料种数', value: data.shortageCount },
              { label: '紧急缺料', value: data.urgentCount, danger: data.urgentCount > 0 },
              {
                label: '紧急（urgent）',
                value: data.items?.filter(i => i.urgencyLevel === 'urgent').length ?? 0,
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
            rowKey={(r) => r.materialCode ?? r.materialName}
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 920 }}
          />
        </>
      )}
    </div>
  );
};

export default ReplenishmentAdvisorPanel;
