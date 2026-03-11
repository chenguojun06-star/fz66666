import React, { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, DatePicker, Form, Input, InputNumber,
  Select, Space, Tag, Popconfirm, Row, Col, Statistic,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  PlusOutlined, SearchOutlined, CheckCircleOutlined,
  CloseCircleOutlined, EditOutlined, DeleteOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import {
  invoiceApi,
  INVOICE_TYPES,
  INVOICE_STATUS,
  type Invoice,
} from '@/services/finance/invoiceApi';

const statusTag = (val: string) => {
  const s = INVOICE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{val}</Tag>;
};
const typeLabel = (val: string) => INVOICE_TYPES.find(t => t.value === val)?.label || val;

const InvoicePage: React.FC = () => {
  const { message } = App.useApp();
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Invoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 统计
  const [stats, setStats] = useState({ draft: 0, issued: 0, totalAmount: 0 });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, size: pageSize };
      if (filterStatus) params.status = filterStatus;
      if (keyword.trim()) params.keyword = keyword.trim();
      const res = await invoiceApi.getList(params);
      if (res.code === 200 && res.data) {
        const records: Invoice[] = res.data.records || res.data || [];
        setList(records);
        setTotal(res.data.total || records.length);
        const draftCount = records.filter(r => r.status === 'DRAFT').length;
        const issuedCount = records.filter(r => r.status === 'ISSUED').length;
        const totalAmt = records.reduce((s, r) => s + (r.totalAmount || 0), 0);
        setStats({ draft: draftCount, issued: issuedCount, totalAmount: totalAmt });
      }
    } catch (err: any) {
      message.error(`加载发票列表失败: ${err?.message || '请检查网络'}`);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, keyword, message]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    setFormOpen(true);
  };

  const handleEdit = (record: Invoice) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      issueDate: record.issueDate ? dayjs(record.issueDate) : undefined,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const data = {
        ...values,
        issueDate: values.issueDate?.format('YYYY-MM-DD'),
      };
      if (editingRecord?.id) {
        await invoiceApi.update({ ...data, id: editingRecord.id });
        message.success('更新成功');
      } else {
        await invoiceApi.create(data);
        message.success('创建成功');
      }
      setFormOpen(false);
      fetchList();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`保存失败: ${err?.message || '请重试'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssue = async (id: string) => {
    try {
      await invoiceApi.issue(id);
      message.success('开票成功');
      fetchList();
    } catch (err: any) {
      message.error(`开票失败: ${err?.message || '请重试'}`);
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await invoiceApi.verify(id);
      message.success('核销成功');
      fetchList();
    } catch (err: any) {
      message.error(`核销失败: ${err?.message || '请重试'}`);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await invoiceApi.cancel(id);
      message.success('作废成功');
      fetchList();
    } catch (err: any) {
      message.error(`作废失败: ${err?.message || '请重试'}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoiceApi.delete(id);
      message.success('删除成功');
      fetchList();
    } catch (err: any) {
      message.error(`删除失败: ${err?.message || '请重试'}`);
    }
  };

  const columns: ColumnsType<Invoice> = [
    { title: '发票号码', dataIndex: 'invoiceNo', width: 160, ellipsis: true },
    { title: '发票类型', dataIndex: 'invoiceType', width: 130, render: typeLabel },
    { title: '购方名称', dataIndex: 'buyerName', width: 160, ellipsis: true },
    { title: '金额', dataIndex: 'amount', width: 100, render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '税额', dataIndex: 'taxAmount', width: 100, render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '价税合计', dataIndex: 'totalAmount', width: 110, render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', width: 90, render: statusTag },
    { title: '开票日期', dataIndex: 'issueDate', width: 110 },
    { title: '创建时间', dataIndex: 'createTime', width: 160, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_: unknown, record: Invoice) => (
        <Space size="small">
          {record.status === 'DRAFT' && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
              <Popconfirm title="确认开票？" onConfirm={() => handleIssue(record.id!)}>
                <Button type="link" size="small" icon={<FileTextOutlined />}>开票</Button>
              </Popconfirm>
            </>
          )}
          {record.status === 'ISSUED' && (
            <>
              <Popconfirm title="确认核销？" onConfirm={() => handleVerify(record.id!)}>
                <Button type="link" size="small" icon={<CheckCircleOutlined />}>核销</Button>
              </Popconfirm>
              <Popconfirm title="确认作废？" onConfirm={() => handleCancel(record.id!)}>
                <Button type="link" size="small" danger icon={<CloseCircleOutlined />}>作废</Button>
              </Popconfirm>
            </>
          )}
          {record.status === 'DRAFT' && (
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
        title="发票管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建发票</Button>}
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col><Statistic title="草稿" value={stats.draft} /></Col>
          <Col><Statistic title="已开票" value={stats.issued} /></Col>
          <Col><Statistic title="总金额" value={stats.totalAmount} prefix="¥" precision={2} /></Col>
        </Row>

        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索发票号/购方名称"
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
            options={INVOICE_STATUS.map(s => ({ value: s.value, label: s.label }))}
          />
        </Space>

        <ResizableTable
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </Card>

      <ResizableModal
        open={formOpen}
        title={editingRecord ? '编辑发票' : '新建发票'}
        onCancel={() => setFormOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        defaultWidth="40vw"
        defaultHeight="50vh"
      >
        <Form form={form} layout="vertical">
          <ModalFieldRow label="发票类型">
            <Form.Item name="invoiceType" rules={[{ required: true, message: '请选择发票类型' }]} noStyle>
              <Select options={INVOICE_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="请选择" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="购方名称">
            <Form.Item name="buyerName" rules={[{ required: true, message: '请输入购方名称' }]} noStyle>
              <Input placeholder="购方企业名称" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="购方税号">
            <Form.Item name="buyerTaxNo" noStyle>
              <Input placeholder="纳税人识别号" />
            </Form.Item>
          </ModalFieldRow>
          <Row gutter={16}>
            <Col span={8}>
              <ModalFieldRow label="金额">
                <Form.Item name="amount" rules={[{ required: true, message: '请输入金额' }]} noStyle>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="不含税金额" />
                </Form.Item>
              </ModalFieldRow>
            </Col>
            <Col span={8}>
              <ModalFieldRow label="税率(%)">
                <Form.Item name="taxRate" rules={[{ required: true, message: '请输入税率' }]} noStyle>
                  <InputNumber style={{ width: '100%' }} min={0} max={100} precision={2} placeholder="如 13" />
                </Form.Item>
              </ModalFieldRow>
            </Col>
            <Col span={8}>
              <ModalFieldRow label="开票日期">
                <Form.Item name="issueDate" noStyle>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </ModalFieldRow>
            </Col>
          </Row>
          <ModalFieldRow label="关联订单号">
            <Form.Item name="relatedOrderNo" noStyle>
              <Input placeholder="可选，关联生产订单号" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="备注">
            <Form.Item name="remark" noStyle>
              <Input.TextArea rows={2} placeholder="备注信息" />
            </Form.Item>
          </ModalFieldRow>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default InvoicePage;
