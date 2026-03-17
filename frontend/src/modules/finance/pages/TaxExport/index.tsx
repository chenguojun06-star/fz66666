import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, DatePicker, Space, Tag, Typography, Divider, Alert, Modal, Tabs, Form, Input, Select, InputNumber, Popconfirm, Statistic } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  DownloadOutlined, FileExcelOutlined, CheckCircleOutlined, LockOutlined, RocketOutlined,
  UnlockOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined, FileTextOutlined,
  DollarOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { paths } from '@/routeConfig';
import { appStoreService } from '@/services/system/appStore';
import { useAuth } from '@/utils/AuthContext';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import invoiceApi from '@/services/finance/invoiceApi';
import type { InvoiceStatus, InvoiceType } from '@/services/finance/invoiceApi';
import payableApi from '@/services/finance/payableApi';
import type { PayableStatus } from '@/services/finance/payableApi';
import taxConfigApi from '@/services/finance/taxConfigApi';
import { message } from '@/utils/antdStatic';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

type ExportFormat = 'STANDARD' | 'KINGDEE' | 'UFIDA';

const FORMAT_OPTIONS = [
  { label: '通用标准格式', value: 'STANDARD' as ExportFormat, desc: '基础 Excel，适合所有财务软件手工导入', free: true },
  { label: '金蝶 KIS 格式', value: 'KINGDEE' as ExportFormat, desc: '金蝶KIS凭证导入格式，直接粘贴无需调整', free: false },
  { label: '用友 T3 格式', value: 'UFIDA' as ExportFormat, desc: '用友T3凭证导入格式，直接粘贴无需调整', free: false },
];

const EXPORT_TYPES = [
  { key: 'payroll', title: '工资结算汇总', desc: '导出指定周期内所有结算单数据，含结算金额、操作工姓名、工序明细', icon: '💰', color: '#52c41a' },
  { key: 'material', title: '物料对账单', desc: '导出面辅料采购、出入库、对账数据，与供应商对账一目了然', icon: '📦', color: '#1890ff' },
  { key: 'supplier-payment', title: '供应商付款汇总', desc: '导出应付账款、已付款、逾期明细，便于对账审计及供应商信用评估', icon: '🏭', color: '#722ed1' },
  { key: 'tax-summary', title: '月度税务汇总', desc: '导出本期开票金额、税种税率、税额合计，可直接用于月度税务申报附表', icon: '📋', color: '#fa8c16' },
];

const INVOICE_TYPES = [
  { value: 'VAT_SPECIAL', label: '增值税专用发票' },
  { value: 'VAT_GENERAL', label: '增值税普通发票' },
  { value: 'ELECTRONIC', label: '电子发票' },
  { value: 'RECEIPT', label: '收据' },
];
const INVOICE_STATUS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'ISSUED', label: '已开票', color: 'green' },
  { value: 'CANCELLED', label: '已作废', color: 'red' },
];
const PAYABLE_STATUS = [
  { value: 'PENDING', label: '待付款', color: 'orange' },
  { value: 'PAID', label: '已付款', color: 'green' },
  { value: 'OVERDUE', label: '已逾期', color: 'red' },
  { value: 'PARTIAL', label: '部分付款', color: 'blue' },
];

const RELATED_BIZ_TYPE_OPTIONS = [
  { value: 'SETTLEMENT', label: '结算单' },
  { value: 'RECONCILIATION', label: '对账单' },
  { value: 'REIMBURSEMENT', label: '报销单' },
  { value: 'ORDER', label: '订单' },
];

const RELATED_BIZ_TYPE_MAP: Record<string, string> = {
  SETTLEMENT: '结算单',
  RECONCILIATION: '对账单',
  REIMBURSEMENT: '报销单',
  ORDER: '订单',
};

const pageShellStyle: React.CSSProperties = {
  padding: '12px 0 32px',
};

const formatCurrency = (value?: number) => (Number(value || 0)).toFixed(2);

const formatBizType = (value?: string) => RELATED_BIZ_TYPE_MAP[value || ''] || value || '-';

// ========== 发票台账 Tab ==========
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
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => {
            setEditRecord(r);
            form.setFieldsValue({
              ...r,
              taxRate: r.taxRate != null ? +(r.taxRate * 100).toFixed(2) : undefined,
              issueDate: r.issueDate ? dayjs(r.issueDate) : undefined,
            });
            setFormOpen(true);
          }}>编辑</Button>
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
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="发票台账已接真实发票表与税额计算"
        description="当前为业务台账管理，不是税控盘/电子发票平台直连。适合先把开票信息、业务来源、税额和状态管起来；若要直连税盘或第三方开票平台，需要后续再接外部接口。"
      />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}><Card size="small"><Statistic title="草稿" value={stats.draftCount} /></Card></Col>
        <Col xs={24} md={6}><Card size="small"><Statistic title="已开票" value={stats.issuedCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={24} md={6}><Card size="small"><Statistic title="本月开票额(元)" value={formatCurrency(stats.monthAmount)} /></Card></Col>
        <Col xs={24} md={6}><Card size="small"><Statistic title="累计开票额(元)" value={formatCurrency(stats.totalIssued)} /></Card></Col>
      </Row>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜发票号 / 购方 / 关联单号"
              value={filters.keyword}
              onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              allowClear
              placeholder="状态"
              style={{ width: '100%' }}
              options={INVOICE_STATUS.map(item => ({ value: item.value, label: item.label }))}
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              allowClear
              placeholder="发票类型"
              style={{ width: '100%' }}
              options={INVOICE_TYPES}
              value={filters.invoiceType}
              onChange={(value) => setFilters(prev => ({ ...prev, invoiceType: value }))}
            />
          </Col>
          <Col xs={24} md={10} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setFilters({ status: undefined, invoiceType: undefined, keyword: '' }); setPage(1); }}>重置</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); form.resetFields(); setFormOpen(true); }}>新建发票</Button>
            </Space>
          </Col>
        </Row>
      </Card>
      <ResizableTable rowKey="id" columns={columns} dataSource={list} loading={loading} size="small"
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }} />
      <ResizableModal
        title={editRecord ? '编辑发票' : '新建发票'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => form.validateFields().then(handleSave)}>保存</Button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ padding: '16px 0' }}>
          <ModalFieldRow label="发票类型">
            <Form.Item name="invoiceType" noStyle rules={[{ required: true }]}>
              <Select options={INVOICE_TYPES} />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="发票号">
            <Form.Item name="invoiceNo" noStyle>
              <Input placeholder="系统默认生成，可手工调整" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="关联业务类型">
            <Form.Item name="relatedBizType" noStyle>
              <Select allowClear options={RELATED_BIZ_TYPE_OPTIONS} placeholder="如：结算单 / 对账单" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="关联单号">
            <Form.Item name="relatedBizNo" noStyle>
              <Input placeholder="如结算单号、对账单号、订单号" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="购方名称">
            <Form.Item name="titleName" noStyle rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="购方税号">
            <Form.Item name="titleTaxNo" noStyle>
              <Input placeholder="91XXXXXXXXXXXXXX" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="未税金额(元)">
            <Form.Item name="amount" noStyle rules={[{ required: true }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="税率(%)">
            <Form.Item name="taxRate" noStyle>
              <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} placeholder="留空则按默认 VAT 税率" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="税额(自动计算)">
            <div style={{ lineHeight: '32px', color: '#595959' }}>
              {calcTaxAmount.toFixed(2)} 元
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>(未税金额 × 税率)</Text>
            </div>
          </ModalFieldRow>
          <ModalFieldRow label="价税合计">
            <div style={{ lineHeight: '32px', fontWeight: 600, color: '#1890ff', fontSize: 15 }}>
              {calcTotal.toFixed(2)} 元
            </div>
          </ModalFieldRow>
          <ModalFieldRow label="开票日期">
            <Form.Item name="issueDate" noStyle>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="销方名称">
            <Form.Item name="sellerName" noStyle>
              <Input placeholder="本公司抬头" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="销方税号">
            <Form.Item name="sellerTaxNo" noStyle>
              <Input />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="备注">
            <Form.Item name="remark" noStyle>
              <Input.TextArea rows={2} />
            </Form.Item>
          </ModalFieldRow>
        </Form>
      </ResizableModal>
    </>
  );
};

// ========== 应付账款 Tab ==========
const PayableTab: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<any>({ pendingAmount: 0, overdueAmount: 0, paidAmount: 0, overdueCount: 0, newThisMonth: 0 });
  const [filters, setFilters] = useState<{ status?: PayableStatus; keyword: string }>({ status: undefined, keyword: '' });
  // 新建应付款
  const [formOpen, setFormOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  // 部分付款弹窗
  const [payRecord, setPayRecord] = useState<any>(null);
  const [payAmount, setPayAmount] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listData, statsData] = await Promise.all([
        payableApi.list({ page, pageSize: 20, ...filters, keyword: filters.keyword || undefined }),
        payableApi.stats(),
      ]);
      const _pr = (listData as any)?.records;
      setList(Array.isArray(_pr) ? _pr : (Array.isArray(listData) ? listData : []));
      setTotal((listData as any)?.total ?? 0);
      setStats(statsData || {});
    } catch { message.error('加载应付账款失败'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkPaid = async (id: string, amount?: number) => {
    try {
      await payableApi.markPaid(id, amount ?? undefined);
      message.success(amount != null ? `已付款 ${amount.toFixed(2)} 元` : '已标记全额付款');
      setPayRecord(null);
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleCreate = async (vals: any) => {
    setSubmitting(true);
    try {
      await payableApi.create({
        ...vals,
        dueDate: vals.dueDate ? dayjs(vals.dueDate).format('YYYY-MM-DD') : undefined,
      });
      message.success('应付款已新建');
      setFormOpen(false);
      createForm.resetFields();
      fetchData();
    } catch { message.error('新建失败'); }
    finally { setSubmitting(false); }
  };

  // 剩余天数：正数=未到期天数，负数=已逾期天数，null=无到期日
  const getRemainDays = (dueDate?: string) => {
    if (!dueDate) return null;
    return dayjs(dueDate).diff(dayjs().startOf('day'), 'day');
  };

  const columns = [
    { title: '应付单号', dataIndex: 'payableNo', width: 140 },
    { title: '供应商', dataIndex: 'supplierName', ellipsis: true },
    { title: '来源单号', dataIndex: 'orderNo', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    { title: '业务说明', dataIndex: 'description', ellipsis: true },
    { title: '应付金额(元)', dataIndex: 'amount', width: 120, render: (v: number) => v?.toFixed(2) },
    { title: '已付金额(元)', dataIndex: 'paidAmount', width: 120, render: (v: number) => (v || 0).toFixed(2) },
    {
      title: '到期/剩余', dataIndex: 'dueDate', width: 150,
      render: (v: string, r: any) => {
        if (!v) return <Text type="secondary">-</Text>;
        if (r.status === 'PAID') return <Text type="secondary">{v}</Text>;
        const days = getRemainDays(v);
        if (days === null) return <span>{v}</span>;
        if (days < 0) return <span>{v} <Tag color="red" style={{ fontSize: 11 }}>逾期{Math.abs(days)}天</Tag></span>;
        if (days === 0) return <span>{v} <Tag color="orange" style={{ fontSize: 11 }}>今日到期</Tag></span>;
        if (days <= 3) return <span>{v} <Tag color="gold" style={{ fontSize: 11 }}>剩{days}天</Tag></span>;
        return <span>{v} <Text type="secondary" style={{ fontSize: 11 }}>({days}天后)</Text></span>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => { const s = PAYABLE_STATUS.find(t => t.value === v); return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{v}</Tag>; }
    },
    {
      title: '操作', width: 140,
      render: (_: any, r: any) => r.status !== 'PAID' && (
        <Space>
          <Popconfirm title="全额付款？" onConfirm={() => handleMarkPaid(r.id)}>
            <Button size="small" type="link" icon={<CheckCircleOutlined />}>全额</Button>
          </Popconfirm>
          <Button size="small" type="link" onClick={() => { setPayRecord(r); setPayAmount(null); }}>部分付</Button>
        </Space>
      ),
    },
  ];

  const rowClassName = (record: any) => {
    if (record.status === 'PAID') return '';
    const days = record.dueDate ? getRemainDays(record.dueDate) : null;
    if (days !== null && days < 0) return 'ap-row-overdue';
    if (days !== null && days <= 3) return 'ap-row-warning';
    return '';
  };

  return (
    <>
      <style>{`
        .ap-row-overdue td { background: #fff1f0 !important; }
        .ap-row-warning td { background: #fffbe6 !important; }
      `}</style>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="待付款(元)" value={(stats.pendingAmount || 0).toFixed(2)} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="逾期金额(元)" value={(stats.overdueAmount || 0).toFixed(2)} valueStyle={{ color: '#f5222d' }} suffix={stats.overdueCount ? <span style={{ fontSize: 12, color: '#f5222d' }}>/{stats.overdueCount}笔</span> : undefined} /></Card></Col>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="本月已付(元)" value={(stats.paidAmount || 0).toFixed(2)} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="本月新增(笔)" value={stats.newThisMonth || 0} /></Card></Col>
      </Row>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜应付单号 / 供应商 / 来源单号"
              value={filters.keyword}
              onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              allowClear
              placeholder="状态"
              style={{ width: '100%' }}
              options={PAYABLE_STATUS.map(item => ({ value: item.value, label: item.label }))}
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
            />
          </Col>
          <Col xs={12} md={12} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setFilters({ status: undefined, keyword: '' }); setPage(1); }}>重置</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setFormOpen(true); }}>新建应付款</Button>
            </Space>
          </Col>
        </Row>
      </Card>
      <Alert type="info" showIcon icon={<DollarOutlined />} style={{ marginBottom: 12 }}
        title="应付账款与业务系统深度联动"
        description="对账单审核通过、工资结算批准后，相关记录自动流入应付账款。逾期应付款红色高亮；3天内到期黄色预警；支持全额或部分付款。"
      />
      <ResizableTable
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        size="small"
        rowClassName={rowClassName}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }}
      />
      {/* 新建应付款 */}
      <ResizableModal
        title="新建应付款"
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => createForm.validateFields().then(handleCreate)}>保存</Button>,
        ]}
      >
        <Form form={createForm} layout="vertical" style={{ padding: '16px 0' }}>
          <ModalFieldRow label="供应商名称">
            <Form.Item name="supplierName" noStyle rules={[{ required: true }]}><Input /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="来源单号">
            <Form.Item name="orderNo" noStyle><Input placeholder="关联对账单号/采购单号（选填）" /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="业务说明">
            <Form.Item name="description" noStyle><Input placeholder="如：1月面料采购货款" /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="应付金额(元)">
            <Form.Item name="amount" noStyle rules={[{ required: true }]}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="付款到期日">
            <Form.Item name="dueDate" noStyle><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
          </ModalFieldRow>
        </Form>
      </ResizableModal>
      {/* 部分付款弹窗 */}
      <Modal
        title={`部分付款 — ${payRecord?.supplierName || ''}`}
        open={!!payRecord}
        onCancel={() => setPayRecord(null)}
        onOk={() => {
          if (!payAmount || payAmount <= 0) { message.warning('请输入付款金额'); return; }
          handleMarkPaid(payRecord.id, payAmount);
        }}
        okText="确认付款"
        width="30vw"
      >
        <div style={{ padding: '12px 0' }}>
          <p style={{ marginBottom: 4 }}>应付金额：<strong>{payRecord?.amount?.toFixed(2)}</strong> 元</p>
          <p style={{ marginBottom: 4 }}>已付金额：<strong>{(payRecord?.paidAmount || 0).toFixed(2)}</strong> 元</p>
          <p style={{ marginBottom: 16 }}>剩余未付：<strong style={{ color: '#fa8c16' }}>{((payRecord?.amount || 0) - (payRecord?.paidAmount || 0)).toFixed(2)}</strong> 元</p>
          <div>
            <span style={{ marginRight: 8 }}>本次付款金额：</span>
            <InputNumber
              min={0.01}
              max={(payRecord?.amount || 0) - (payRecord?.paidAmount || 0)}
              precision={2}
              style={{ width: 160 }}
              value={payAmount ?? undefined}
              onChange={(v) => setPayAmount(v)}
              placeholder="输入付款金额"
            />
            <span style={{ marginLeft: 8, color: '#888' }}>元</span>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ========== 税率配置 Tab ==========
const TaxConfigTab: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxConfigApi.list();
      setList(Array.isArray(data) ? data : []);
    } catch { message.error('加载税率配置失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSave = async (vals: any) => {
    setSubmitting(true);
    try {
      // taxRate: 用户输入 % 整数，小数存入库（除以 100）
      const payload = {
        ...vals,
        taxRate: vals.taxRate / 100,
        effectiveDate: vals.effectiveDate ? dayjs(vals.effectiveDate).format('YYYY-MM-DD') : undefined,
        expiryDate: vals.expiryDate ? dayjs(vals.expiryDate).format('YYYY-MM-DD') : undefined,
      };
      if (editRecord?.id) {
        await taxConfigApi.update({ ...editRecord, ...payload });
      } else {
        await taxConfigApi.create(payload);
      }
      message.success('保存成功');
      setFormOpen(false);
      fetchList();
    } catch { message.error('保存失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await taxConfigApi.remove(id);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  const columns = [
    { title: '税种名称', dataIndex: 'taxName', width: 150 },
    { title: '税种代码', dataIndex: 'taxCode', width: 120 },
    { title: '税率(%)', dataIndex: 'taxRate', width: 100, render: (v: number) => v != null ? `${(v * 100).toFixed(2)}%` : '-' },
    { title: '默认', dataIndex: 'isDefault', width: 80, render: (v: number) => v === 1 ? <Tag color="blue">默认</Tag> : '-' },
    { title: '生效日期', dataIndex: 'effectiveDate', width: 110, render: (v: string) => v || '-' },
    { title: '失效日期', dataIndex: 'expiryDate', width: 110, render: (v: string) => v || '长期有效' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag> },
    {
      title: '操作', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => {
            setEditRecord(r);
            form.setFieldsValue({
              ...r,
              taxRate: r.taxRate != null ? +(r.taxRate * 100).toFixed(2) : undefined,
              effectiveDate: r.effectiveDate ? dayjs(r.effectiveDate) : undefined,
              expiryDate: r.expiryDate ? dayjs(r.expiryDate) : undefined,
            });
            setFormOpen(true);
          }}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="税率配置会参与真实税额计算"
        description="发票台账默认 VAT 税额来自这里的默认税率；建议至少维护默认 VAT、附加税等常用税码，并标清生效时间。"
      />
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); form.resetFields(); setFormOpen(true); }}>新增税率</Button>
      </div>
      <ResizableTable rowKey="id" columns={columns} dataSource={list} loading={loading} size="small" pagination={false} />
      <ResizableModal
        title={editRecord ? '编辑税率' : '新增税率'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        defaultWidth="40vw"
        defaultHeight="40vh"
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => form.validateFields().then(handleSave)}>保存</Button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ padding: '16px 0' }}>
          <ModalFieldRow label="税种名称">
            <Form.Item name="taxName" noStyle rules={[{ required: true }]}><Input /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="税种代码">
            <Form.Item name="taxCode" noStyle rules={[{ required: true }]}><Input placeholder="如 VAT_6 / INCOME_25" /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="税率(%)">
            <Form.Item name="taxRate" noStyle rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="默认税率">
            <Form.Item name="isDefault" noStyle initialValue={0}>
              <Select options={[{ value: 1, label: '是' }, { value: 0, label: '否' }]} />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="生效日期">
            <Form.Item name="effectiveDate" noStyle>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="失效日期">
            <Form.Item name="expiryDate" noStyle>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="描述">
            <Form.Item name="description" noStyle><Input placeholder="如：适用一般纳税人" /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="状态">
            <Form.Item name="status" noStyle initialValue="ACTIVE">
              <Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]} />
            </Form.Item>
          </ModalFieldRow>
        </Form>
      </ResizableModal>
    </>
  );
};

// ========== 主页面 ==========
const TaxExport: React.FC = () => {
  const navigate = useNavigate();
  const [format, setFormat] = useState<ExportFormat>('STANDARD');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState<string>('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) { setSubscribed(true); setSubscriptionType('PERMANENT'); setChecking(false); return; }
    appStoreService.getMyApps().then((apps: any) => {
      const list = Array.isArray(apps) ? apps : (apps?.records || apps?.data || []);
      const taxApp = list.find((a: any) => a.appCode === 'FINANCE_TAX' && !a.isExpired);
      setSubscribed(!!taxApp);
      if (taxApp) setSubscriptionType(taxApp.subscriptionType || '');
    }).catch(() => { }).finally(() => setChecking(false));
  }, [isSuperAdmin]);

  const handleFormatClick = (opt: typeof FORMAT_OPTIONS[0]) => {
    if (!opt.free && !subscribed) {
      Modal.confirm({
        width: '30vw',
        title: '专业格式 — 付费功能',
        icon: <LockOutlined style={{ color: '#f59e0b' }} />,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>金蝶/用友专用格式需要开通<strong>财税对接模块</strong>（¥499/月）。</p>
            <p style={{ color: '#888', fontSize: 13 }}>通用标准格式永久免费，适合手工导入任意财务软件。</p>
          </div>
        ),
        okText: '前往开通',
        cancelText: '继续用免费版',
        onOk: () => navigate(paths.appStore),
      });
      return;
    }
    setFormat(opt.value);
  };

  const handleExport = async (type: string) => {
    const selectedOpt = FORMAT_OPTIONS.find(f => f.value === format);
    if (selectedOpt && !selectedOpt.free && !subscribed) {
      message.warning('当前格式需要开通财税对接模块，已自动切换为通用标准格式');
      setFormat('STANDARD');
      return;
    }
    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      const url = `/api/finance/tax-export/${type}?startDate=${startDate}&endDate=${endDate}&format=${format}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` },
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.message || `下载失败 (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1].replace(/"/g, '')) : `export_${type}_${startDate}.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      message.success(`${filename} 下载成功`);
    } catch (e: any) {
      message.error(e?.message || '导出失败，请稍后重试');
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  if (checking) {
    return <Layout><div style={{ textAlign: 'center', padding: '80px 0' }}><span>加载中…</span></div></Layout>;
  }

  const selectedFormatInfo = FORMAT_OPTIONS.find(f => f.value === format);

  const exportTabContent = (
    <div style={{ width: '100%' }}>
      {!subscribed && (
        <Alert type="info" showIcon icon={<UnlockOutlined />} style={{ marginBottom: 16 }}
          title="通用标准格式永久免费"
          description={<span>适合手工导入任意财务软件。如需金蝶/用友专用格式，可开通
            <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => navigate(paths.appStore)}>财税对接模块（¥499/月）</Button>
          </span>} />
      )}
      {subscribed && (
        <Alert type="success" showIcon
          icon={subscriptionType === 'FREE' ? <span style={{ fontSize: 16 }}>🎁</span> : <RocketOutlined />}
          style={{ marginBottom: 16 }}
          title={subscriptionType === 'FREE' ? '新开户赠送已激活 · 财税对接模块（1年免费）' : '已开通财税对接模块'}
          description={subscriptionType === 'FREE' ? '恭喜！金蝶 KIS / 用友 T3 专用格式均已为您解锁，有效期1年。' : '金蝶 KIS / 用友 T3 专用格式均已解锁。'} />
      )}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="当前导出能力说明"
        description="这里导出的是真实业务数据，不是展示假按钮；但现阶段属于 Excel 凭证导入模板，不是税控盘、电子发票平台、金蝶/用友开放平台 API 直连。已接数据源：工资结算、物料对账。"
      />
      <Card title="第一步：选择导出格式" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          {FORMAT_OPTIONS.map(opt => {
            const locked = !opt.free && !subscribed;
            const selected = format === opt.value;
            return (
              <Col xs={24} md={8} key={opt.value}>
                <div onClick={() => handleFormatClick(opt)} style={{
                  border: `2px solid ${selected ? '#1890ff' : locked ? '#f0f0f0' : '#d9d9d9'}`,
                  borderRadius: 8, padding: '12px 16px',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  background: selected ? '#e6f7ff' : locked ? '#fafafa' : '#fff',
                  transition: 'all 0.2s', position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text strong style={{ color: locked ? '#bbb' : undefined }}>{opt.label}</Text>
                    {opt.free
                      ? <Tag color="green" style={{ fontSize: 11 }}>免费</Tag>
                      : <Tag color={subscribed ? 'gold' : 'default'} icon={subscribed ? <CheckCircleOutlined /> : <LockOutlined />} style={{ fontSize: 11 }}>
                          {subscribed ? '已解锁' : '付费'}
                        </Tag>}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{opt.desc}</Text>
                  {selected && <CheckCircleOutlined style={{ position: 'absolute', top: 10, right: 10, color: '#1890ff' }} />}
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>
      <Card title="第二步：选择日期范围" style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker value={dateRange} onChange={val => val && setDateRange(val as [Dayjs, Dayjs])}
            format="YYYY-MM-DD" allowClear={false}
            presets={[
              { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: '本季度', value: [dayjs().subtract(dayjs().month() % 3, 'month').startOf('month'), dayjs()] },
              { label: '本年', value: [dayjs().startOf('year'), dayjs()] },
            ]} />
          <Text type="secondary">{dateRange[0].format('YYYY年MM月DD日')} — {dateRange[1].format('YYYY年MM月DD日')}</Text>
        </Space>
      </Card>
      <Card title={<span>第三步：选择导出内容 <Tag color="blue" style={{ marginLeft: 8 }}>{selectedFormatInfo?.label}</Tag></span>}>
        <Row gutter={[16, 16]}>
          {EXPORT_TYPES.map(type => (
            <Col xs={24} md={12} key={type.key}>
              <Card size="small" style={{ border: `1px solid ${type.color}30`, background: `${type.color}06` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 32, lineHeight: 1 }}>{type.icon}</div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 15, color: type.color }}>{type.title}</Text>
                    <Paragraph type="secondary" style={{ margin: '4px 0 12px', fontSize: 12 }}>{type.desc}</Paragraph>
                    <Button type="primary" icon={<DownloadOutlined />} loading={loading[type.key]}
                      onClick={() => handleExport(type.key)} style={{ background: type.color, borderColor: type.color }}>
                      导出 Excel
                    </Button>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
        <Divider style={{ margin: '20px 0 12px' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <FileExcelOutlined style={{ color: '#52c41a', fontSize: 16 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>导出文件为 .xlsx 格式 · 金蝶/用友格式当前为基础凭证导入列模板，如客户账套科目编码有差异，仍需按企业实际会计科目校准。</Text>
        </div>
      </Card>
    </div>
  );

  const tabs = [
    { key: 'export', label: <span><FileExcelOutlined />数据导出</span>, children: exportTabContent },
    { key: 'invoice', label: <span><FileTextOutlined />发票台账</span>, children: <InvoiceTab /> },
    { key: 'payable', label: <span><DollarOutlined />应付账款</span>, children: <PayableTab /> },
    { key: 'taxconfig', label: <span><SettingOutlined />税率配置</span>, children: <TaxConfigTab /> },
  ];

  return (
    <Layout>
      <div style={pageShellStyle}>
        <Title level={4} style={{ marginBottom: 4 }}>
          <FileExcelOutlined style={{ marginRight: 8, color: '#52c41a' }} />
          财税管理
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          数据导出、发票台账、应付账款、税率配置一站式管理
        </Text>
        <Tabs items={tabs} defaultActiveKey="export" />
      </div>
    </Layout>
  );
};

export default TaxExport;
