import React, { useState, useCallback } from 'react';
import { Button, Tag, Table } from 'antd';
import { BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { CapacityGapResponse } from '@/services/intelligence/intelligenceApi';

const gapColor: Record<string, string> = {
  safe: '#39ff14', tight: '#f7a600', gap: '#ff8c00', critical: '#ff4136',
};
const gapLabel: Record<string, string> = {
  safe: '产能充足', tight: '产能偏紧', gap: '存在缺口', critical: '严重不足',
};

const CapacityGapPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CapacityGapResponse | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getCapacityGap();
      setData((res as any)?.data ?? null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    { title: '工厂', dataIndex: 'factoryName', key: 'factoryName', width: 110 },
    { title: '在产件数', dataIndex: 'pendingQuantity', key: 'pendingQuantity', width: 80 },
    { title: '日产能', dataIndex: 'dailyCapacity', key: 'dailyCapacity', width: 75 },
    {
      title: '预计完成天数',
      dataIndex: 'estimatedDaysToComplete',
      key: 'estimatedDaysToComplete',
      width: 100,
      render: (v: number) => `${v}天`,
    },
    { title: '最近截单日', dataIndex: 'nearestDueDate', key: 'nearestDueDate', width: 110 },
    {
      title: '距截单',
      dataIndex: 'daysToNearestDue',
      key: 'daysToNearestDue',
      width: 75,
      render: (v: number) => <span style={{ color: v <= 3 ? '#ff4136' : 'inherit' }}>{v}天</span>,
    },
    {
      title: '缺口天数',
      dataIndex: 'gapDays',
      key: 'gapDays',
      width: 80,
      render: (v: number) => v > 0
        ? <span style={{ color: '#ff4136', fontWeight: 600 }}>+{v}天</span>
        : <span style={{ color: '#39ff14' }}>0</span>,
    },
    {
      title: '状态',
      dataIndex: 'gapLevel',
      key: 'gapLevel',
      width: 90,
      render: (v: string) =>
        <Tag color={gapColor[v] ?? '#888'}>{gapLabel[v] ?? v}</Tag>,
    },
    { title: '建议', dataIndex: 'advice', key: 'advice', ellipsis: true },
  ];

  return (
    <div className="c-card">
      <div className="c-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><BarChartOutlined /> 产能缺口分析</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleLoad} type="primary">
          {data ? '刷新' : '开始分析'}
        </Button>
      </div>

      {error && <div style={{ color: '#ff4136', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: '工厂总数', value: data.totalFactories },
              { label: '存在缺口', value: data.gapFactoryCount, danger: true },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (item as any).danger && item.value > 0 ? '#ff4136' : 'inherit' }}>{item.value}</div>
              </div>
            ))}
          </div>
          <Table
            dataSource={data.factories ?? []}
            columns={columns}
            rowKey="factoryName"
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 820 }}
            rowClassName={(row) =>
              row.gapLevel === 'critical' ? 'row-danger' : row.gapLevel === 'gap' ? 'row-warning' : ''
            }
          />
        </>
      )}
    </div>
  );
};

export default CapacityGapPanel;
