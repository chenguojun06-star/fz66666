import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, InputNumber, Space, Spin, Table, Tag } from 'antd';
import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { MaterialPurchase } from '@/types/production';
import { materialPurchaseApi } from '@/services/production/productionApi';

interface ProcurementQuickPanelProps {
  orderNo: string;
  visible: boolean;
  onDataChanged?: () => void;
}

const statusMap: Record<string, { text: string; color: string }> = {
  pending: { text: '待采购', color: 'orange' },
  partial: { text: '部分到货', color: 'blue' },
  received: { text: '已到货', color: 'green' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
};

const ProcurementQuickPanel: React.FC<ProcurementQuickPanelProps> = ({
  orderNo, visible, onDataChanged,
}) => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<MaterialPurchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiveLoadingId, setReceiveLoadingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
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

  const handleBulkReceive = useCallback(async () => {
    setBulkLoading(true);
    try {
      await materialPurchaseApi.smartReceiveAll({ orderNo });
      message.success('一键收料完成');
      await loadRecords();
      onDataChanged?.();
    } catch {
      message.error('一键收料失败');
    } finally {
      setBulkLoading(false);
    }
  }, [orderNo, loadRecords, message, onDataChanged]);

  const pendingCount = records.filter(r => r.status === 'pending' || r.status === 'partial').length;

  const columns = [
    {
      title: '物料', dataIndex: 'materialName', width: 140, ellipsis: true,
      render: (v: string, r: MaterialPurchase) => (
        <span>{v}{r.color ? <Tag style={{ marginLeft: 4 }} color="blue">{r.color}</Tag> : null}</span>
      ),
    },
    {
      title: '需求', dataIndex: 'purchaseQuantity', width: 70, align: 'center' as const,
      render: (v: number, r: MaterialPurchase) => `${v} ${r.unit || ''}`,
    },
    {
      title: '已到', dataIndex: 'arrivedQuantity', width: 60, align: 'center' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#999' }}>{v || 0}</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center' as const,
      render: (v: string) => {
        const s = statusMap[v] || { text: v, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作', width: 160, align: 'center' as const,
      render: (_: unknown, r: MaterialPurchase) => {
        if (r.status === 'completed' || r.status === 'received') {
          return <Tag icon={<CheckCircleOutlined />} color="success">已收</Tag>;
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
            >收料</Button>
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
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#666' }}>
          共 {records.length} 项物料，{pendingCount > 0 ? <Tag color="orange">{pendingCount} 项待处理</Tag> : <Tag color="green">全部已到</Tag>}
        </span>
        {pendingCount > 0 && (
          <Button
            type="primary" icon={<ThunderboltOutlined />}
            loading={bulkLoading} onClick={handleBulkReceive}
          >一键全部收料</Button>
        )}
      </div>
      <Table
        dataSource={records} columns={columns} rowKey="id"
        size="small" pagination={false} scroll={{ y: 320 }}
      />
    </Spin>
  );
};

export default ProcurementQuickPanel;
