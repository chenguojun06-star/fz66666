import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, InputNumber, Space, Spin, Table, Tag } from 'antd';
import { PlusOutlined, ScissorOutlined, DeleteOutlined } from '@ant-design/icons';
import { productionCuttingApi } from '@/services/production/productionApi';

interface BundleRecord {
  id: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  status?: string;
}

interface BundleInputRow {
  key: number;
  color: string;
  size: string;
  quantity: number;
}

interface CuttingQuickPanelProps {
  orderId: string;
  orderNo: string;
  visible: boolean;
  bundles: BundleRecord[];
  onDataChanged?: () => void;
}

let rowKeyCounter = 0;

const CuttingQuickPanel: React.FC<CuttingQuickPanelProps> = ({
  orderId, orderNo, visible, bundles, onDataChanged,
}) => {
  const { message } = App.useApp();
  const [generating, setGenerating] = useState(false);
  const [inputRows, setInputRows] = useState<BundleInputRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  // 加载已有菲号汇总
  const loadSummary = useCallback(async () => {
    if (!orderId && !orderNo) return;
    setSummaryLoading(true);
    try {
      const res = await productionCuttingApi.bundleSummary({ orderId, orderNo });
      const data = res?.data || {};
      setSummary(typeof data === 'object' && data !== null ? data as Record<string, number> : {});
    } catch {
      // 静默：汇总非关键
    } finally {
      setSummaryLoading(false);
    }
  }, [orderId, orderNo]);

  useEffect(() => {
    if (visible && orderId) loadSummary();
  }, [visible, orderId, loadSummary]);

  const addRow = useCallback(() => {
    setInputRows(prev => [...prev, { key: ++rowKeyCounter, color: '', size: '', quantity: 1 }]);
  }, []);

  const removeRow = useCallback((key: number) => {
    setInputRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const updateRow = useCallback((key: number, field: keyof BundleInputRow, value: string | number) => {
    setInputRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }, []);

  const handleGenerate = useCallback(async () => {
    const validRows = inputRows.filter(r => r.color && r.size && r.quantity > 0);
    if (validRows.length === 0) {
      message.warning('请至少填写一行有效的颜色、尺码和数量');
      return;
    }
    setGenerating(true);
    try {
      await productionCuttingApi.generateBundles({
        orderId,
        bundles: validRows.map(r => ({ color: r.color, size: r.size, quantity: r.quantity })),
      });
      message.success(`已生成 ${validRows.length} 组菲号`);
      setInputRows([]);
      await loadSummary();
      onDataChanged?.();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '生成菲号失败';
      message.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [orderId, inputRows, loadSummary, message, onDataChanged]);

  // 已有菲号按 颜色+尺码 分组显示
  const grouped = bundles.reduce<Record<string, { count: number; totalQty: number }>>((acc, b) => {
    const key = `${b.color || '-'}/${b.size || '-'}`;
    if (!acc[key]) acc[key] = { count: 0, totalQty: 0 };
    acc[key].count += 1;
    acc[key].totalQty += (b.quantity || 0);
    return acc;
  }, {});

  const inputColumns = [
    {
      title: '颜色', dataIndex: 'color', width: 120,
      render: (_: string, r: BundleInputRow) => (
        <input
          className="ant-input ant-input-sm" style={{ width: '100%' }}
          placeholder="如: 红色" value={r.color}
          onChange={e => updateRow(r.key, 'color', e.target.value)}
        />
      ),
    },
    {
      title: '尺码', dataIndex: 'size', width: 100,
      render: (_: string, r: BundleInputRow) => (
        <input
          className="ant-input ant-input-sm" style={{ width: '100%' }}
          placeholder="如: XL" value={r.size}
          onChange={e => updateRow(r.key, 'size', e.target.value)}
        />
      ),
    },
    {
      title: '数量(件)', dataIndex: 'quantity', width: 100,
      render: (_: number, r: BundleInputRow) => (
        <InputNumber size="small" min={1} value={r.quantity} style={{ width: '100%' }}
          onChange={v => updateRow(r.key, 'quantity', v ?? 1)}
        />
      ),
    },
    {
      title: '', width: 40, align: 'center' as const,
      render: (_: unknown, r: BundleInputRow) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeRow(r.key)} />
      ),
    },
  ];

  return (
    <Spin spinning={summaryLoading}>
      {/* 已有菲号汇总 */}
      {bundles.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            已生成菲号 <Tag color="blue">{bundles.length} 扎</Tag>
          </div>
          <Space wrap size={[8, 4]}>
            {Object.entries(grouped).map(([key, val]) => (
              <Tag key={key}>{key}：{val.count}扎 / {val.totalQty}件</Tag>
            ))}
          </Space>
        </div>
      ) : (
        <Alert type="info" showIcon message="该订单尚未生成菲号" style={{ marginBottom: 16 }} />
      )}

      {/* 新增菲号输入区 */}
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500 }}>新增菲号</span>
        <Button size="small" icon={<PlusOutlined />} onClick={addRow}>添加一行</Button>
      </div>

      {inputRows.length > 0 ? (
        <>
          <Table
            dataSource={inputRows} columns={inputColumns} rowKey="key"
            size="small" pagination={false} scroll={{ y: 200 }}
          />
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Button
              type="primary" icon={<ScissorOutlined />}
              loading={generating} onClick={handleGenerate}
            >
              生成菲号（{inputRows.filter(r => r.color && r.size && r.quantity > 0).length} 组）
            </Button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>
          点击「添加一行」开始录入裁剪菲号
        </div>
      )}
    </Spin>
  );
};

export default CuttingQuickPanel;
