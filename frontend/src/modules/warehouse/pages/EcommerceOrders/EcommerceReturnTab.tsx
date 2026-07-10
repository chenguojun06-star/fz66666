import React, { useState, useCallback, useEffect } from 'react';
import { Form, Input, Select, Button, Space, Tag, App, Popconfirm, Modal, InputNumber } from 'antd';
import { RollbackOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, DollarOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { getSalesReturnList, approveSalesReturn, rejectSalesReturn, markRefunded, createSalesReturn } from '@/modules/crm/api/salesReturn';
import type { SalesReturn } from '@/modules/crm/types/salesReturn';
import { formatMoney } from '@/utils/format';

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待审核', color: 'orange' },
  APPROVED: { label: '已审核', color: 'blue' },
  REFUNDED: { label: '已退款', color: 'green' },
  REJECTED: { label: '已拒绝', color: 'red' },
};

interface EcommerceReturnTabProps {
  /** 当前选中的电商订单（用于从订单详情发起退货） */
  selectedOrder?: {
    id: number;
    orderNo: string;
    productionOrderId?: string;
    productionOrderNo?: string;
    productName?: string;
    skuCode?: string;
    quantity?: number;
    payAmount?: number;
  } | null;
  onRefreshOrder?: () => void;
}

const EcommerceReturnTab: React.FC<EcommerceReturnTabProps> = ({ selectedOrder, onRefreshOrder }) => {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<SalesReturn[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const { message, modal } = App.useApp();

  const fetchList = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const { records, total: t } = await getSalesReturnList({
        page: p,
        pageSize: ps,
        returnNo: values.keyword,
        originalOrderNo: values.keyword,
        customerName: values.keyword,
        returnStatus: values.status,
      });
      setList(records ?? []);
      setTotal(t ?? 0);
    } catch {
      message.error('退货列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, form, message]);

  useEffect(() => { fetchList(); }, [page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = () => { setPage(1); fetchList(1); };
  const onReset = () => { form.resetFields(); setPage(1); fetchList(1); };

  // 从电商订单创建退货单
  const openCreateModal = () => {
    if (!selectedOrder) {
      message.warning('请先在订单管理Tab中选择一个电商订单');
      return;
    }
    if (!selectedOrder.productionOrderId) {
      message.warning('该电商订单未关联生产订单，无法发起退货');
      return;
    }
    createForm.resetFields();
    createForm.setFieldsValue({
      quantity: selectedOrder.quantity || 1,
      unitPrice: selectedOrder.payAmount || 0,
      returnReason: '',
    });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      await createSalesReturn({
        originalOrderId: Number(selectedOrder!.productionOrderId) || 0,
        ecommerceOrderId: selectedOrder!.id,
        returnReason: values.returnReason,
        remark: values.remark,
        items: [{
          styleNo: selectedOrder!.skuCode || '',
          styleName: selectedOrder!.productName || '',
          quantity: values.quantity,
          unitPrice: values.unitPrice,
          returnReason: values.returnReason,
        }],
      });
      message.success('退货单创建成功');
      setCreateOpen(false);
      fetchList();
      onRefreshOrder?.();
    } catch {
      message.error('退货单创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveSalesReturn(id, {});
      message.success('审核通过');
      fetchList();
      onRefreshOrder?.();
    } catch {
      message.error('审核失败');
    }
  };

  const handleReject = async (id: number) => {
    modal.confirm({
      title: '拒绝退货',
      content: '确定拒绝此退货单吗？',
      onOk: async () => {
        try {
          await rejectSalesReturn(id, '管理员拒绝');
          message.success('已拒绝');
          fetchList();
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const handleRefund = async (id: number) => {
    try {
      await markRefunded(id);
      message.success('已标记退款');
      fetchList();
      onRefreshOrder?.();
    } catch {
      message.error('操作失败');
    }
  };

  const columns = [
    { title: '退货单号', dataIndex: 'returnNo', key: 'returnNo', width: 180, fixed: 'left' as const },
    { title: '原订单号', dataIndex: 'originalOrderNo', key: 'originalOrderNo', width: 150, ellipsis: true },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 140, ellipsis: true },
    {
      title: '退货类型', dataIndex: 'returnType', key: 'returnType', width: 90,
      render: (v: string) => v === 'FULL' ? <Tag>全部退货</Tag> : <Tag color="blue">部分退货</Tag>,
    },
    {
      title: '状态', dataIndex: 'returnStatus', key: 'returnStatus', width: 90,
      render: (v: string) => { const m = STATUS_META[v] ?? { label: v, color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
    {
      title: '退货金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 110, align: 'right' as const,
      render: (v: number) => formatMoney(Number(v) || 0),
    },
    { title: '退货原因', dataIndex: 'returnReason', key: 'returnReason', width: 180, ellipsis: true },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160 },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: SalesReturn) => {
        if (record.returnStatus === 'PENDING') {
          return (
            <Space size={0}>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record.id)}>审核</Button>
              <Popconfirm title="确定拒绝此退货单？" onConfirm={() => handleReject(record.id)}>
                <Button type="link" size="small" danger icon={<CloseOutlined />}>拒绝</Button>
              </Popconfirm>
            </Space>
          );
        }
        if (record.returnStatus === 'APPROVED') {
          return <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => handleRefund(record.id)}>标记退款</Button>;
        }
        return <span style={{ color: '#999' }}>-</span>;
      },
    },
  ];

  return (
    <div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="keyword" label="关键词">
          <Input allowClear placeholder="退货单号/原订单号/客户" style={{ width: 220 }} onPressEnter={onSearch} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select allowClear placeholder="全部状态" style={{ width: 130 }}>
            <Select.Option value="PENDING">待审核</Select.Option>
            <Select.Option value="APPROVED">已审核</Select.Option>
            <Select.Option value="REFUNDED">已退款</Select.Option>
            <Select.Option value="REJECTED">已拒绝</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" icon={<RollbackOutlined />} onClick={onSearch}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
            <Button icon={<RollbackOutlined />} onClick={openCreateModal}>发起退货</Button>
          </Space>
        </Form.Item>
      </Form>
      {selectedOrder && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          当前选中订单：{selectedOrder.orderNo} · {selectedOrder.productName || '-'} · ¥{selectedOrder.payAmount || 0}
        </div>
      )}
      <ResizableTable
        dataSource={list}
        columns={columns}
        rowKey="id"
        loading={loading}
        emptyDescription="暂无退货记录"
        scroll={{ x: 1300 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      <Modal
        title={`发起退货 - ${selectedOrder?.orderNo || ''}`}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        width={480}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="退货数量" name="quantity" rules={[{ required: true, message: '请输入退货数量' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="退货单价" name="unitPrice" rules={[{ required: true, message: '请输入退货单价' }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
          </Form.Item>
          <Form.Item label="退货原因" name="returnReason">
            <Input.TextArea rows={2} placeholder="请输入退货原因" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={1} placeholder="备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EcommerceReturnTab;
