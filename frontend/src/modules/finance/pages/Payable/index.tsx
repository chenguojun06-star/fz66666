import React, { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, DatePicker, Form, Input, InputNumber,
  Select, Space, Tag, Popconfirm, Row, Col, Statistic, Alert,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  PlusOutlined, SearchOutlined, DollarOutlined,
  EditOutlined, DeleteOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import SupplierSelect from '@/components/common/SupplierSelect';
import {
  payableApi,
  PAYABLE_STATUS,
  type Payable,
  type PayableStats,
} from '@/services/finance/payableApi';

const statusTag = (val: string) => {
  const s = PAYABLE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{val}</Tag>;
};

const PayablePage: React.FC = () => {
  const { message } = App.useApp();
  const [list, setList] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Payable | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 付款弹窗
  const [payOpen, setPayOpen] = useState(false);
  const [payRecord, setPayRecord] = useState<Payable | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);

  // 统计
  const [stats, setStats] = useState<PayableStats>({ totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, size: pageSize };
      if (filterStatus) params.status = filterStatus;
      if (keyword.trim()) params.keyword = keyword.trim();
      const res = await payableApi.getList(params);
      if (res.code === 200 && res.data) {
        const records: Payable[] = res.data.records || res.data || [];
        setList(records);
        setTotal(res.data.total || records.length);
      }
    } catch (err: any) {
      message.error(`加载应付列表失败: ${err?.message || '请检查网络'}`);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, keyword, message]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await payableApi.getStats();
      if (res.code === 200 && res.data) setStats(res.data);
    } catch {
      // 统计加载失败不阻断
    }
  }, []);

  useEffect(() => { fetchList(); fetchStats(); }, [fetchList, fetchStats]);

  const handleCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    setFormOpen(true);
  };

  const handleEdit = (record: Payable) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      dueDate: record.dueDate ? dayjs(record.dueDate) : undefined,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const data = { ...values, dueDate: values.dueDate?.format('YYYY-MM-DD') };
      if (editingRecord?.id) {
        await payableApi.update({ ...data, id: editingRecord.id });
        message.success('更新成功');
      } else {
        await payableApi.create(data);
        message.success('创建成功');
      }
      setFormOpen(false);
      fetchList();
      fetchStats();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`保存失败: ${err?.message || '请重试'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openPayment = (record: Payable) => {
    setPayRecord(record);
    setPayAmount((record.amount || 0) - (record.paidAmount || 0));
    setPayOpen(true);
  };

  const handlePayment = async () => {
    if (!payRecord?.id || payAmount <= 0) return;
    try {
      await payableApi.confirmPayment(payRecord.id, payAmount);
      message.success('付款确认成功');
      setPayOpen(false);
      fetchList();
      fetchStats();
    } catch (err: any) {
      message.error(`付款失败: ${err?.message || '请重试'}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await payableApi.delete(id);
      message.success('删除成功');
      fetchList();
      fetchStats();
    } catch (err: any) {
      message.error(`删除失败: ${err?.message || '请重试'}`);
    }
  };

  const columns: ColumnsType<Payable> = [
    { title: '应付单号', dataIndex: 'payableNo', width: 160, ellipsis: true },
    { title: '供应商', dataIndex: 'supplierName', width: 150, ellipsis: true },
    { title: '应付金额', dataIndex: 'amount', width: 110, render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '已付金额', dataIndex: 'paidAmount', width: 110, render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    {
      title: '未付金额', key: 'unpaid', width: 110,
      render: (_: unknown, r: Payable) => {
        const unpaid = (r.amount || 0) - (r.paidAmount || 0);
        return <span style={{ color: unpaid > 0 ? '#ff4d4f' : '#52c41a' }}>¥{unpaid.toFixed(2)}</span>;
      },
    },
    { title: '到期日', dataIndex: 'dueDate', width: 110 },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    { title: '创建时间', dataIndex: 'createTime', width: 160, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    {
      title: '操作', key: 'actions', width: 180, fixed: 'right',
      render: (_: unknown, record: Payable) => (
        <Space size="small">
          {(record.status === 'PENDING' || record.status === 'PARTIAL' || record.status === 'OVERDUE') && (
            <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => openPayment(record)}>付款</Button>
          )}
          {record.status === 'PENDING' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          )}
          {record.status === 'PENDING' && (
            <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id!)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Layout>
      <Card
        title="应付账款"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建应付</Button>}
      >
        {stats.overdueCount > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={`当前有 ${stats.overdueCount} 笔逾期应付账款，逾期总额 ¥${stats.totalOverdue.toFixed(2)}`}
            style={{ marginBottom: 16 }}
          />
        )}

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col><Statistic title="待付总额" value={stats.totalPending} prefix="¥" precision={2} /></Col>
          <Col><Statistic title="逾期总额" value={stats.totalOverdue} prefix="¥" precision={2} valueStyle={{ color: '#ff4d4f' }} /></Col>
          <Col><Statistic title="逾期笔数" value={stats.overdueCount} valueStyle={{ color: '#ff4d4f' }} /></Col>
          <Col><Statistic title="本月新增" value={stats.newThisMonth} /></Col>
        </Row>

        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索单号/供应商"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => fetchList()}
            style={{ width: 220 }}
            allowClear
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 130 }}
            value={filterStatus}
            onChange={v => { setFilterStatus(v); setPage(1); }}
            options={PAYABLE_STATUS.map(s => ({ value: s.value, label: s.label }))}
          />
        </Space>

        <ResizableTable
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </Card>

      {/* 新建/编辑弹窗 */}
      <ResizableModal
        open={formOpen}
        title={editingRecord ? '编辑应付账款' : '新建应付账款'}
        onCancel={() => setFormOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        defaultWidth="40vw"
        defaultHeight="50vh"
      >
        <Form form={form} layout="vertical">
          <ModalFieldRow label="供应商">
            <Form.Item name="supplierName" rules={[{ required: true, message: '请选择供应商' }]} noStyle>
              <SupplierSelect placeholder="选择供应商" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="应付金额">
            <Form.Item name="amount" rules={[{ required: true, message: '请输入金额' }]} noStyle>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" placeholder="应付金额" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="到期日">
            <Form.Item name="dueDate" rules={[{ required: true, message: '请选择到期日' }]} noStyle>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="关联订单号">
            <Form.Item name="relatedOrderNo" noStyle>
              <Input placeholder="可选" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="说明">
            <Form.Item name="description" noStyle>
              <Input.TextArea rows={2} placeholder="备注说明" />
            </Form.Item>
          </ModalFieldRow>
        </Form>
      </ResizableModal>

      {/* 付款弹窗 */}
      <ResizableModal
        open={payOpen}
        title="确认付款"
        onCancel={() => setPayOpen(false)}
        onOk={handlePayment}
        defaultWidth="30vw"
        defaultHeight="40vh"
      >
        <div style={{ padding: '16px 0' }}>
          <p>应付单号：{payRecord?.payableNo}</p>
          <p>供应商：{payRecord?.supplierName}</p>
          <p>应付金额：¥{(payRecord?.amount || 0).toFixed(2)}</p>
          <p>已付金额：¥{(payRecord?.paidAmount || 0).toFixed(2)}</p>
          <p>剩余应付：¥{((payRecord?.amount || 0) - (payRecord?.paidAmount || 0)).toFixed(2)}</p>
          <ModalFieldRow label="本次付款金额">
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              max={(payRecord?.amount || 0) - (payRecord?.paidAmount || 0)}
              precision={2}
              value={payAmount}
              onChange={v => setPayAmount(v || 0)}
              prefix="¥"
            />
          </ModalFieldRow>
        </div>
      </ResizableModal>
    </Layout>
  );
};

export default PayablePage;
