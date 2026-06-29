import React, { useState, useCallback, useEffect } from 'react';
import { App, Button, Card, Col, Empty, Form, Input, InputNumber, Row, Select, Space, Tag, Tabs } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import StandardModal from '@/components/common/StandardModal';
import {
  EXPENSE_TYPES,
  EXPENSE_STATUS,
  PAYMENT_METHODS,
  expenseReimbursementApi,
  type ExpenseReimbursement,
} from '@/services/finance/expenseReimbursementApi';

const typeLabel = (val: string): React.ReactNode => {
  const t = EXPENSE_TYPES.find(e => e.value === val);
  return t ? <Tag color={t.color}>{t.label}</Tag> : <Tag>{val}</Tag>;
};
const statusTag = (val: string) => {
  const s = EXPENSE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{val}</Tag>;
};

interface ExpenseTabProps {
  /** 默认费用类型筛选（如 'other' 用于"其他费用"Tab） */
  defaultExpenseType?: string;
  /** 新建按钮文案 */
  createButtonText?: string;
}

const ExpenseTab: React.FC<ExpenseTabProps> = ({ defaultExpenseType, createButtonText = '新建报销' }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [list, setList] = useState<ExpenseReimbursement[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterType, setFilterType] = useState<string | undefined>(defaultExpenseType);
  const [keyword, setKeyword] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, size: pageSize };
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.expenseType = filterType;
      if (keyword.trim()) params.keyword = keyword.trim();
      const res = await expenseReimbursementApi.getList(params);
      if (res.code === 200) {
        setList(res.data?.records || res.data?.list || []);
        setTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '查询失败');
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '查询异常');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterType, keyword, message]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const openForm = () => { form.resetFields(); if (defaultExpenseType) form.setFieldValue('expenseType', defaultExpenseType); setFormOpen(true); };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await expenseReimbursementApi.create(values);
      if (res.code === 200) {
        message.success('报销单创建成功');
        setFormOpen(false);
        setPage(1);
        void fetchList();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await expenseReimbursementApi.delete(id);
      if (res.code === 200) { message.success('删除成功'); void fetchList(); }
      else { message.error(res.message || '删除失败'); }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const columns: ColumnsType<ExpenseReimbursement> = [
    { title: '报销单号', dataIndex: 'reimbursementNo', width: 140 },
    { title: '事由', dataIndex: 'title', width: 150, ellipsis: true },
    { title: '类型', dataIndex: 'expenseType', width: 100, render: (val: string) => typeLabel(val) },
    { title: '金额', dataIndex: 'amount', width: 100, align: 'right', render: (val: number) => <span style={{ color: 'var(--color-danger)' }}>{formatMoney(val || 0)}</span> },
    { title: '费用日期', dataIndex: 'expenseDate', width: 110, render: (val: string) => val ? formatDateTime(val) : '-' },
    { title: '状态', dataIndex: 'status', width: 80, render: (val: string) => statusTag(val) },
    { title: '报销人', dataIndex: 'applicantName', width: 80, render: (val: string) => val || '-' },
    { title: '提交时间', dataIndex: 'createTime', width: 100, render: (val: string) => val ? dayjs(val).format('MM-DD') : '-' },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, record: ExpenseReimbursement) => {
        const actions: RowAction[] = [];
        if (record.status === 'pending' || record.status === 'rejected') {
          actions.push({ key: 'del', label: '删除', danger: true, onClick: () => handleDelete(record.id!) });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }} styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={[12, 12]} align="middle">
          <Col>
            <Select value={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1); }} allowClear placeholder="审批状态" style={{ width: 120 }}
              options={[{ value: 'pending', label: '待审批' }, { value: 'approved', label: '已审批' }, { value: 'paid', label: '已付款' }]} />
          </Col>
          <Col>
            <Select value={filterType} onChange={(v) => { setFilterType(v); setPage(1); }} allowClear placeholder="费用类型" style={{ width: 120 }} options={EXPENSE_TYPES} />
          </Col>
          <Col>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onPressEnter={() => { setPage(1); void fetchList(); }} placeholder="搜索事由" style={{ width: 160 }} suffix={<SearchOutlined style={{ color: 'var(--color-text-quaternary)' }} />} />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space size={8}>
              <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={openForm}>{createButtonText}</Button>
              <Button size="small" ghost onClick={() => { void fetchList(); }}>刷新</Button>
            </Space>
          </Col>
        </Row>
      </Card>
      <ResizableTable storageKey="tax-tools-expense" rowKey="id" columns={columns} dataSource={list} loading={loading} stickyHeader scroll={{ x: 1000 }}
        locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`, onChange: (p, s) => { setPage(p); setPageSize(s); } }}
      />
      <StandardModal open={formOpen} title="新建报销单" onCancel={() => setFormOpen(false)} size="lg"
        onOk={handleFormSubmit} okText="提交" confirmLoading={submitting}
      >
        <div style={{ padding: '0 8px' }}>
          <Form form={form} layout="vertical" requiredMark="optional">
            <Row gutter={16}>
              <Col span={12}><Form.Item name="expenseType" label="费用类型" rules={[{ required: true, message: '请选择费用类型' }]}><Select options={EXPENSE_TYPES} placeholder="请选择" /></Form.Item></Col>
              <Col span={12}><Form.Item name="title" label="报销事由" rules={[{ required: true, message: '请填写报销事由' }]}><Input placeholder="如：出差往返打车费" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}><Form.Item name="amount" label="报销金额" rules={[{ required: true, message: '请填写金额' }]}><InputNumber min={0.01} precision={2} prefix="¥" placeholder="0.00" style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="expenseDate" label="费用日期" rules={[{ required: true, message: '请选择日期' }]}><Input placeholder="YYYY-MM-DD" /></Form.Item></Col>
            </Row>
            <Form.Item name="description" label="详细说明"><Input.TextArea rows={2} placeholder="详细描述费用用途" /></Form.Item>
            <Row gutter={16}>
              <Col span={12}><Form.Item name="paymentMethod" label="收款方式" rules={[{ required: true }]}><Select options={PAYMENT_METHODS} placeholder="请选择" /></Form.Item></Col>
              <Col span={12}><Form.Item name="accountName" label="收款户名" rules={[{ required: true, message: '请填写收款户名' }]}><Input placeholder="收款人姓名" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={14}><Form.Item name="paymentAccount" label="收款账号" rules={[{ required: true, message: '请填写收款账号' }]}><Input placeholder="银行卡号/支付宝/微信账号" /></Form.Item></Col>
              <Col span={10}><Form.Item name="bankName" label="开户银行（选填）"><Input placeholder="转账时填写开户行" /></Form.Item></Col>
            </Row>
          </Form>
        </div>
      </StandardModal>
    </Space>
  );
};

export default ExpenseTab;