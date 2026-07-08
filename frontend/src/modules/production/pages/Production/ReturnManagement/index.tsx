import React, { useState, useCallback, useEffect } from 'react';
import { Card, Tabs, Form, Input, Select, Button, Space, Tag, App, Popconfirm, DatePicker } from 'antd';
import { RollbackOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, DollarOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { getSalesReturnList, approveSalesReturn, rejectSalesReturn, markRefunded } from '@/modules/crm/api/salesReturn';
import type { SalesReturn } from '@/modules/crm/types/salesReturn';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';

const { RangePicker } = DatePicker;

type ReturnTab = 'purchase' | 'sales';

interface PurchaseReturnRecord {
  id: number;
  returnNo: string;
  originalPurchaseId: string;
  supplierName?: string;
  returnType: 'FULL' | 'PARTIAL';
  returnReason?: string;
  returnStatus: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
  totalAmount: number;
  operatorName?: string;
  createTime: string;
  approveTime?: string;
  completeTime?: string;
  remark?: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待审核', color: 'orange' },
  APPROVED: { label: '已审核', color: 'blue' },
  COMPLETED: { label: '已完成', color: 'green' },
  REFUNDED: { label: '已退款', color: 'green' },
  REJECTED: { label: '已拒绝', color: 'red' },
};

const ReturnManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReturnTab>('purchase');
  const [loading, setLoading] = useState(false);
  const [purchaseList, setPurchaseList] = useState<PurchaseReturnRecord[]>([]);
  const [salesList, setSalesList] = useState<SalesReturn[]>([]);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [salesTotal, setSalesTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();

  const fetchPurchaseList = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const params: Record<string, unknown> = { page: p, pageSize: ps, ...values };
      const res = await api.get('/production/purchase-return/list', { params });
      const data = res?.data ?? res;
      const records = Array.isArray(data) ? data : (data?.records ?? []);
      setPurchaseList(records);
      setPurchaseTotal(data?.total ?? records.length);
    } catch (e) {
      message.error('采购退货列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, form, message]);

  const fetchSalesList = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const { records, total } = await getSalesReturnList({
        page: p,
        pageSize: ps,
        returnNo: values.keyword,
        originalOrderNo: values.keyword,
        customerName: values.keyword,
        returnStatus: values.status,
      });
      setSalesList(records ?? []);
      setSalesTotal(total ?? 0);
    } catch (e) {
      message.error('销售退货列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, form, message]);

  const reload = useCallback(() => {
    if (activeTab === 'purchase') fetchPurchaseList();
    else fetchSalesList();
  }, [activeTab, fetchPurchaseList, fetchSalesList]);

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [activeTab, page, pageSize]);

  const onSearch = () => { setPage(1); reload(); };

  const onReset = () => { form.resetFields(); setPage(1); reload(); };

  // 采购退货操作
  const handlePurchaseAction = async (record: PurchaseReturnRecord, action: 'approve' | 'complete') => {
    try {
      await api.post(`/production/purchase-return/${record.id}/${action}`, {});
      message.success(action === 'approve' ? '审核通过' : '退货已完成');
      reload();
    } catch (e) {
      message.error(action === 'approve' ? '审核失败' : '完成退货失败');
    }
  };

  // 销售退货操作
  const handleSalesApprove = async (id: number) => {
    try {
      await approveSalesReturn(id, {});
      message.success('审核通过');
      reload();
    } catch { message.error('审核失败'); }
  };

  const handleSalesReject = async (id: number) => {
    modal.confirm({
      title: '拒绝退货',
      content: '确定拒绝此退货单吗？',
      onOk: async () => {
        try {
          await rejectSalesReturn(id, '管理员拒绝');
          message.success('已拒绝');
          reload();
        } catch { message.error('操作失败'); }
      },
    });
  };

  const handleSalesRefund = async (id: number) => {
    try {
      await markRefunded(id);
      message.success('已标记退款');
      reload();
    } catch { message.error('操作失败'); }
  };

  const purchaseColumns = [
    { title: '退货单号', dataIndex: 'returnNo', key: 'returnNo', width: 180, fixed: 'left' as const },
    { title: '原采购单号', dataIndex: 'originalPurchaseId', key: 'originalPurchaseId', width: 160, ellipsis: true },
    { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 150, ellipsis: true },
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
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 90 },
    {
      title: '操作', key: 'action', width: 140, fixed: 'right' as const,
      render: (_: unknown, record: PurchaseReturnRecord) => {
        if (record.returnStatus === 'PENDING') {
          return (
            <Space size={0}>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handlePurchaseAction(record, 'approve')}>审核</Button>
              <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => message.warning('如需拒绝请联系管理员')}>拒绝</Button>
            </Space>
          );
        }
        if (record.returnStatus === 'APPROVED') {
          return <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => handlePurchaseAction(record, 'complete')}>完成退货</Button>;
        }
        return <span style={{ color: '#999' }}>-</span>;
      },
    },
  ];

  const salesColumns = [
    { title: '退货单号', dataIndex: 'returnNo', key: 'returnNo', width: 180, fixed: 'left' as const },
    { title: '原订单号', dataIndex: 'originalOrderNo', key: 'originalOrderNo', width: 160, ellipsis: true },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 150, ellipsis: true },
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
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleSalesApprove(record.id)}>审核</Button>
              <Popconfirm title="确定拒绝此退货单？" onConfirm={() => handleSalesReject(record.id)}>
                <Button type="link" size="small" danger icon={<CloseOutlined />}>拒绝</Button>
              </Popconfirm>
            </Space>
          );
        }
        if (record.returnStatus === 'APPROVED') {
          return <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => handleSalesRefund(record.id)}>标记退款</Button>;
        }
        return <span style={{ color: '#999' }}>-</span>;
      },
    },
  ];

  const filterForm = (
    <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
      <Form.Item name="keyword" label="关键词">
        <Input allowClear placeholder="退货单号/原单号/客户/供应商" style={{ width: 220 }} onPressEnter={onSearch} />
      </Form.Item>
      <Form.Item name="status" label="状态">
        <Select allowClear placeholder="全部状态" style={{ width: 130 }}>
          <Select.Option value="PENDING">待审核</Select.Option>
          <Select.Option value="APPROVED">已审核</Select.Option>
          <Select.Option value="COMPLETED">已完成</Select.Option>
          <Select.Option value="REFUNDED">已退款</Select.Option>
          <Select.Option value="REJECTED">已拒绝</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item name="dateRange" label="时间">
        <RangePicker style={{ width: 220 }} />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" icon={<RollbackOutlined />} onClick={onSearch}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );

  return (
    <Card title="退货管理" bordered={false}>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => { setActiveTab(k as ReturnTab); setPage(1); }}
        items={[
          {
            key: 'purchase',
            label: '采购退货',
            children: (
              <>
                {filterForm}
                <ResizableTable
                  dataSource={purchaseList}
                  columns={purchaseColumns}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 1400 }}
                  pagination={{
                    current: page,
                    pageSize,
                    total: purchaseTotal,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                  }}
                />
              </>
            ),
          },
          {
            key: 'sales',
            label: '销售退货',
            children: (
              <>
                {filterForm}
                <ResizableTable
                  dataSource={salesList}
                  columns={salesColumns}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 1400 }}
                  pagination={{
                    current: page,
                    pageSize,
                    total: salesTotal,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                  }}
                />
              </>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default ReturnManagement;
