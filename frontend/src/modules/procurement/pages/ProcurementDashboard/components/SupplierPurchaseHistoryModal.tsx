import React, { useEffect, useState } from 'react';
import { Card, Space, Tag, Typography, message } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { ModalField, ModalFieldGrid, ModalHeaderCard } from '@/components/common/ModalContentLayout';
import { procurementApi, type PurchaseOrder, type Supplier } from '@/services/procurement/procurementApi';

const { Text } = Typography;

const statusTagColor: Record<string, string> = {
  pending: 'default',
  approved: 'blue',
  in_transit: 'processing',
  received: 'green',
  settled: 'success',
  cancelled: 'red',
  completed: 'success',
  partial: 'orange',
  partial_arrival: 'orange',
};

const statusLabel: Record<string, string> = {
  pending: '待处理',
  approved: '已审批',
  in_transit: '运输中',
  received: '已收货',
  settled: '已结算',
  cancelled: '已取消',
  completed: '已完成',
  partial: '部分到货',
  partial_arrival: '部分到货',
};

const normalizeStatus = (value?: string) => String(value || '').trim().toLowerCase();

interface SupplierPurchaseHistoryModalProps {
  open: boolean;
  supplier?: Supplier | null;
  onClose: () => void;
  onViewOrder: (order: PurchaseOrder) => void;
}

const SupplierPurchaseHistoryModal: React.FC<SupplierPurchaseHistoryModalProps> = ({
  open,
  supplier,
  onClose,
  onViewOrder,
}) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  useEffect(() => {
    if (!open || !supplier?.id) return;
    const page = pagination.current;
    const pageSize = pagination.pageSize;
    setLoading(true);
    procurementApi.listSupplierPurchaseOrders(supplier.id, { page, pageSize })
      .then(res => {
        const data = (res as any)?.data ?? res;
        setOrders(data?.records ?? []);
        setTotal(data?.total ?? 0);
      })
      .catch(() => {
        setOrders([]);
        setTotal(0);
        message.error('供应商采购历史加载失败');
      })
      .finally(() => setLoading(false));
  }, [open, supplier?.id, pagination.current, pagination.pageSize]);

  const totalAmount = orders.reduce((sum, item) => sum + Number(item.totalAmount ?? 0), 0);
  const pendingCount = orders.filter(item => normalizeStatus(item.status) === 'pending').length;

  const columns: ColumnsType<PurchaseOrder> = [
    { title: '采购单号', dataIndex: 'purchaseNo', width: 160, render: value => <Text code style={{ fontSize: 12 }}>{value || '-'}</Text> },
    { title: '物料名称', dataIndex: 'materialName', width: 160 },
    { title: '数量', dataIndex: 'purchaseQuantity', width: 100, render: (_value, record) => `${record.purchaseQuantity ?? record.quantity ?? '-'} ${record.unit ?? ''}` },
    { title: '总金额', dataIndex: 'totalAmount', width: 100, render: value => value != null ? `￥${Number(value).toLocaleString()}` : '-' },
    {
      title: '状态', dataIndex: 'status', width: 100, render: value => (
        <Tag color={statusTagColor[normalizeStatus(value)] ?? 'default'}>{statusLabel[normalizeStatus(value)] ?? value ?? '-'}</Tag>
      ),
    },
    { title: '创建时间', dataIndex: 'createTime', width: 120, render: value => value?.substring(0, 10) ?? '-' },
    {
      title: '操作', width: 80, fixed: 'right' as const,
      render: (_value, record) => {
        const actions: RowAction[] = [
          { key: 'view', label: '详情', primary: true, onClick: () => onViewOrder(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <ResizableModal
      title="供应商采购历史"
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="关闭"
      cancelButtonProps={{ style: { display: 'none' } }}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      destroyOnClose
    >
      <div style={{ marginTop: 12 }}>
        <ModalHeaderCard>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neutral-text)' }}>{supplier?.factoryName || '-'}</div>
            <div style={{ marginTop: 8 }}>
              <Space size={16} wrap>
                <ModalField label="联系人" value={supplier?.contactPerson || '-'} />
                <ModalField label="联系电话" value={supplier?.contactPhone || '-'} />
                <ModalField label="供应商编码" value={supplier?.factoryCode || '-'} />
              </Space>
            </div>
          </div>
        </ModalHeaderCard>

        <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
          <ModalFieldGrid columns={3}>
            <ModalField label="历史采购单数" value={total} />
            <ModalField label="当前页金额合计" value={`￥${totalAmount.toLocaleString()}`} />
            <ModalField label="当前页待处理" value={pendingCount} />
          </ModalFieldGrid>
        </Card>

        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: count => `共 ${count} 条`,
          }}
          onChange={(p: TablePaginationConfig) => {
            setPagination({ current: p.current ?? 1, pageSize: p.pageSize ?? 10 });
          }}
          scroll={{ x: 860 }}
        />
      </div>
    </ResizableModal>
  );
};

export default SupplierPurchaseHistoryModal;
