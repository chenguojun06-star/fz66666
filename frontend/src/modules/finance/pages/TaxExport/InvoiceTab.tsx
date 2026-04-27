import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Space, Tag, Typography, Alert, Form, Input, Select, InputNumber, Popconfirm, Statistic, DatePicker } from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import invoiceApi from '@/services/finance/invoiceApi';
import type { InvoiceStatus, InvoiceType } from '@/services/finance/invoiceApi';
import { message } from '@/utils/antdStatic';
import {
  INVOICE_TYPES,
  INVOICE_STATUS,
  RELATED_BIZ_TYPE_OPTIONS,
  formatCurrency,
  formatBizType,
} from './taxExportConstants';

const { Text } = Typography;

const InvoiceTab: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const watchAmount = Form.useWatch<number>('amount', form);
  const watchTaxRate = Form.useWatch<number>('taxRate', form);
  const calcTaxAmount = (watchAmount && watchTaxRate) ? parseFloat(((watchAmount || 0) * (watchTaxRate || 0) / 100).toFixed(2)) : 0;
  const calcTotal = parseFloat(((watchAmount || 0) + calcTaxAmount).toFixed(2));
  const [stats, setStats] = useState({ draftCount: 0, issuedCount: 0, monthAmount: 0, totalIssued: 0 });
  const [filters, setFilters] = useState<{
    status?: InvoiceStatus;
    invoiceType?: InvoiceType;
    keyword: string;
  }>({ status: undefined, invoiceType: undefined, keyword: '' });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const [data, statsData] = await Promise.all([
        invoiceApi.list({ page, pageSize: 20, ...filters, keyword: filters.keyword || undefined }),
        invoiceApi.stats(),
      ]);
      const _r0 = (data as any)?.records;
      const records = Array.isArray(_r0) ? _r0 : (Array.isArray(data) ? data : []);
      setList(records);
      setTotal((data as any)?.total ?? records.length);
      setStats({
        draftCount: Number((statsData as any)?.draftCount || 0),
        issuedCount: Number((statsData as any)?.issuedCount || 0),
        monthAmount: Number((statsData as any)?.monthAmount || 0),
        totalIssued: Number((statsData as any)?.totalIssued || 0),
      });
    } catch { message.error('加载发票列表失败'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!formOpen) {
      form.resetFields();
      return;
    }
    if (!editRecord) return;
    form.setFieldsValue({
      ...editRecord,
      taxRate: editRecord.taxRate != null ? +(editRecord.taxRate * 100).toFixed(2) : undefined,
      issueDate: editRecord.issueDate ? dayjs(editRecord.issueDate) : undefined,
    });
  }, [editRecord, form, formOpen]);

  const handleSave = async (vals: any) => {
    setSubmitting(true);
    try {
      const taxRateDecimal = vals.taxRate != null ? vals.taxRate / 100 : 0;
      const taxAmountVal = parseFloat(((vals.amount || 0) * taxRateDecimal).toFixed(2));
      const totalAmountVal = parseFloat(((vals.amount || 0) + taxAmountVal).toFixed(2));
      const payload = {
        ...vals,
        taxRate: vals.taxRate != null ? taxRateDecimal : undefined,
        taxAmount: taxAmountVal,
        totalAmount: totalAmountVal,
        issueDate: vals.issueDate ? dayjs(vals.issueDate).format('YYYY-MM-DD') : undefined,
      };
      if (editRecord?.id) {
        await invoiceApi.update({ ...editRecord, ...payload });
      } else {
        await invoiceApi.create(payload);
      }
      message.success('保存成功');
      setFormOpen(false);
      fetchList();
    } catch { message.error('保存失败'); }
    finally { setSubmitting(false); }
  };

  const handleIssue = async (id: string) => {
    try {
      await invoiceApi.issue(id);
      message.success('已标记为已开票');
      fetchList();
    } catch { message.error('操作失败'); }
  };

  const handleCancel = async (id: string) => {
    try {
      await invoiceApi.cancel(id);
      message.success('已作废');
      fetchList();
    } catch { message.error('操作失败'); }
  };

  const columns = [
    { title: '发票号', dataIndex: 'invoiceNo', width: 140 },
    { title: '发票类型', dataIndex: 'invoiceType', width: 130, render: (v: string) => INVOICE_TYPES.find(t => t.value === v)?.label || v },
    { title: '关联业务', dataIndex: 'relatedBizType', width: 110, render: (v: string) => formatBizType(v) },
    { title: '关联单号', dataIndex: 'relatedBizNo', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    { title: '购方名称', dataIndex: 'titleName', ellipsis: true },
    { title: '未税金额', dataIndex: 'amount', width: 110, render: (v: number) => formatCurrency(v) },
    { title: '税额', dataIndex: 'taxAmount', width: 100, render: (v: number) => formatCurrency(v) },
    { title: '价税合计', dataIndex: 'totalAmount', width: 110, render: (v: number) => formatCurrency(v) },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => { const s = INVOICE_STATUS.find(t => t.value === v); return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{v}</Tag>; } },
    { title: '开票日期', dataIndex: 'issueDate', width: 100 },
    {
      title: '操作', width: 160,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditRecord(r); setFormOpen(true); }}>编辑</Button>
          {r.status === 'DRAFT' && <Button size="small" type="link" onClick={() => handleIssue(r.id)}>开票</Button>}
          {r.status === 'ISSUED' && (
            <Popconfirm title="确认作废该发票？" onConfirm={() => handleCancel(r.id)}>
              <Button size="small" type="link" danger>作废</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        title="发票台账已接真实发票表与税额计算"
        description="当前为业务台账管理，不是税控盘/电子发票平台直连。适合先把开票信息、业务来源、税额和状态管起来；若要直连税盘或第三方开票平台，需要后续再接外部接口。"
      />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}><Card size="small"><Statistic title="草稿" value={stats.draftCount} /></Card></Col>
        <Col xs={24} md={6}><Card size="small"><Statistic title="已开票" value={stats.issuedCount} styles={{ content: { color: '#52c41a' } }} /></Card></Col>
        <Col xs={24} md={6}><Card size="small"><Statistic title="本月开票额(元)" value={formatCurrency(stats.monthAmount)} /></Card></Col>
        <Col xs={24} md={6}><Card size="small"><Statistic title="累计开票额(元)" value={formatCurrency(stats.totalIssued)} /></Card></Col>
      </Row>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <Input allowClear prefix={<SearchOutlined />} placeholder="搜发票号 / 购方 / 关联单号"
              value={filters.keyword}
              onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select allowClear placeholder="状态" style={{ width: '100%' }}
              options={INVOICE_STATUS.map(item => ({ value: item.value, label: item.label }))}
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select allowClear placeholder="发票类型" style={{ width: '100%' }}
              options={INVOICE_TYPES}
              value={filters.invoiceType}
              onChange={(value) => setFilters(prev => ({ ...prev, invoiceType: value }))}
            />
          </Col>
          <Col xs={24} md={10} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setFilters({ status: undefined, invoiceType: undefined, keyword: '' }); setPage(1); }}>重置</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); setFormOpen(true); }}>新建发票</Button>
            </Space>
          </Col>
        </Row>
      </Card>
      <ResizableTable rowKey="id" columns={columns} dataSource={list} loading={loading} size="small"
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }}
      />
      <ResizableModal
        title={editRecord ? '编辑发票' : '新建发票'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => form.validateFields().then(handleSave).catch(() => {})}>保存</Button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ padding: '16px 0' }}>
          <ModalFieldRow label="发票类型"><Form.Item name="invoiceType" noStyle rules={[{ required: true }]}><Select options={INVOICE_TYPES} /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="发票号"><Form.Item name="invoiceNo" noStyle><Input placeholder="系统默认生成，可手工调整" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="关联业务类型"><Form.Item name="relatedBizType" noStyle><Select allowClear options={RELATED_BIZ_TYPE_OPTIONS} placeholder="如：结算单 / 对账单" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="关联单号"><Form.Item name="relatedBizNo" noStyle><Input placeholder="如结算单号、对账单号、订单号" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="购方名称"><Form.Item name="titleName" noStyle rules={[{ required: true }]}><Input /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="购方税号"><Form.Item name="titleTaxNo" noStyle><Input placeholder="91XXXXXXXXXXXXXX" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="未税金额(元)"><Form.Item name="amount" noStyle rules={[{ required: true }]}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="税率(%)"><Form.Item name="taxRate" noStyle><InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} placeholder="留空则按默认 VAT 税率" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="税额(自动计算)">
            <div style={{ lineHeight: '32px', color: '#595959' }}>
              {calcTaxAmount.toFixed(2)} 元
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>(未税金额 × 税率)</Text>
            </div>
          </ModalFieldRow>
          <ModalFieldRow label="价税合计">
            <div style={{ lineHeight: '32px', fontWeight: 600, color: '#1890ff', fontSize: 15 }}>{calcTotal.toFixed(2)} 元</div>
          </ModalFieldRow>
          <ModalFieldRow label="开票日期"><Form.Item name="issueDate" noStyle><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="销方名称"><Form.Item name="sellerName" noStyle><Input placeholder="本公司抬头" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="销方税号"><Form.Item name="sellerTaxNo" noStyle><Input /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="备注"><Form.Item name="remark" noStyle><Input.TextArea rows={2} /></Form.Item></ModalFieldRow>
        </Form>
      </ResizableModal>
    </>
  );
};

export default InvoiceTab;
