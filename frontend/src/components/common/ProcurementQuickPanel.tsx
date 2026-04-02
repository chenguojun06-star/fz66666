import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, InputNumber, Space, Spin, Table, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { MaterialPurchase } from '@/types/production';
import { materialPurchaseApi } from '@/services/production/productionApi';

interface ProcurementQuickPanelProps {
  orderNo: string;
  visible: boolean;
  onDataChanged?: () => void;
}

const ProcurementQuickPanel: React.FC<ProcurementQuickPanelProps> = ({
  orderNo, visible, onDataChanged,
}) => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<MaterialPurchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiveLoadingId, setReceiveLoadingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<Record<string, number>>({});

  const loadRecords = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      const res = await materialPurchaseApi.listByOrderNo(orderNo);
      const list = (res?.data?.records || res?.data || []) as MaterialPurchase[];
      setRecords(Array.isArray(list) ? list : []);
    } catch {
      message.error('加载采购记录失败');
    } finally {
      setLoading(false);
    }
  }, [orderNo, message]);

  useEffect(() => {
    if (visible && orderNo) loadRecords();
  }, [visible, orderNo, loadRecords]);

  const handleReceive = useCallback(async (record: MaterialPurchase) => {
    const qty = editQty[record.id!] ?? Number(record.purchaseQuantity);
    if (!qty || qty <= 0) { message.warning('请输入到货数量'); return; }
    setReceiveLoadingId(record.id!);
    try {
      await materialPurchaseApi.receive({ purchaseId: record.id!, arrivedQuantity: qty });
      message.success(`${record.materialName} 到货 ${qty} ${record.unit || '件'}`);
      await loadRecords();
      onDataChanged?.();
    } catch {
      message.error('收料失败');
    } finally {
      setReceiveLoadingId(null);
    }
  }, [editQty, loadRecords, message, onDataChanged]);

  const pendingCount = records.filter(r => r.status === 'pending' || r.status === 'partial').length;

  const columns = [
    {
      title: '面料编号', dataIndex: 'materialName', width: 140, ellipsis: true,
      render: (v: string, r: MaterialPurchase) => (
        <span>{v}{r.color ? <Tag style={{ marginLeft: 4 }} color="blue">{r.color}</Tag> : null}</span>
      ),
    },
    {
      title: '需求数量', dataIndex: 'requiredQuantity', width: 90, align: 'center' as const,
      render: (_v: number, r: MaterialPurchase) => {
        const qty = (r as Record<string, unknown>).requiredQuantity ?? r.purchaseQuantity ?? 0;
        return `${qty} ${r.unit || ''}`;
      },
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 90, align: 'center' as const,
      render: (v: number, r: MaterialPurchase) => `${v ?? 0} ${r.unit || ''}`,
    },
    {
      title: '到货数量', dataIndex: 'arrivedQuantity', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#999' }}>{v || 0}</span>,
    },
    {
      title: '操作', width: 150, align: 'center' as const,
      render: (_: unknown, r: MaterialPurchase) => {
        if (r.status === 'completed' || r.status === 'received') {
          return <Tag icon={<CheckCircleOutlined />} color="success">已确认</Tag>;
        }
        return (
          <Space size={4}>
            <InputNumber
              size="small" min={1} style={{ width: 64 }}
              defaultValue={Number(r.purchaseQuantity) || 1}
              onChange={(v) => setEditQty(prev => ({ ...prev, [r.id!]: v ?? 0 }))}
            />
            <Button
              type="primary" size="small"
              loading={receiveLoadingId === r.id}
              onClick={() => handleReceive(r)}
            >确认到料</Button>
          </Space>
        );
      },
    },
  ];

  if (!records.length && !loading) {
    return <Alert type="info" showIcon message="该订单暂无采购记录" style={{ margin: '16px 0' }} />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: '#666' }}>
          共 {records.length} 项面料，{pendingCount > 0
            ? <Tag color="orange">{pendingCount} 项待确认</Tag>
            : <Tag color="green">全部已到</Tag>}
        </span>
      </div>
      <Table
        dataSource={records} columns={columns} rowKey="id"
        size="small" pagination={false} scroll={{ y: 320 }}
      />
    </Spin>
  );
};

export default ProcurementQuickPanel;
