import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { AlertOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { MaterialShortageResult } from '@/services/intelligence/intelligenceApi';

const riskColor: Record<string, string> = {
  high: '#ff4136', medium: '#f7a600', low: '#39ff14',
  HIGH: '#ff4136', MEDIUM: '#f7a600', LOW: '#39ff14',
};

const MaterialShortagePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MaterialShortageResult | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getMaterialShortage();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 120 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 90 },
    { title: '当前库存', dataIndex: 'currentStock', key: 'currentStock', width: 80 },
    { title: '需求量', dataIndex: 'demandQuantity', key: 'demandQuantity', width: 80 },
    {
      title: '缺口',
      dataIndex: 'shortageQuantity',
      key: 'shortageQuantity',
      width: 80,
      render: (v: number) => <span style={{ color: '#ff4136', fontWeight: 600 }}>-{v}</span>,
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 70,
      render: (v: string) => <Tag color={riskColor[v] ?? '#888'}>{v}</Tag>,
    },
    { title: '建议供应商', dataIndex: 'supplierName', key: 'supplierName', width: 110 },
    { title: '联系方式', dataIndex: 'supplierPhone', key: 'supplierPhone', width: 120 },
  ];

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><AlertOutlined /> 缺料提前预警</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '开始检测'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '缺料物料', value: data.shortageItems?.length ?? 0 },
              { label: '库存充足', value: data.sufficientCount ?? 0 },
              { label: '受影响订单', value: data.coveredOrderCount ?? 0 },
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
          {data.summary && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 8,
              padding: '8px 14px', marginBottom: 14, fontSize: 13, color: 'var(--text-primary)',
            }}>
              {data.summary}
            </div>
          )}
          <Table
            dataSource={data.shortageItems ?? []}
            columns={columns}
            rowKey="materialCode"
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 780 }}
          />
        </>
      )}
    </div>
  );
};

export default MaterialShortagePanel;
