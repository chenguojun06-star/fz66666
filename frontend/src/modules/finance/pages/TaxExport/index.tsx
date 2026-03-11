import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Button, DatePicker, Space, Tag, Typography, message, Divider, Alert, Modal,
  Tabs, Table, Form, Input, Select, InputNumber, Popconfirm, Statistic,
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, CheckCircleOutlined, LockOutlined, RocketOutlined,
  UnlockOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined, FileTextOutlined,
  DollarOutlined,
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
import payableApi from '@/services/finance/payableApi';
import taxConfigApi from '@/services/finance/taxConfigApi';

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
  const [stats, setStats] = useState({ draft: 0, issued: 0, totalAmount: 0 });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoiceApi.list({ page, size: 20 });
      const records = (data as any)?.records || data || [];
      setList(records);
      setTotal((data as any)?.total || records.length);
      setStats({
        draft: records.filter((r: any) => r.status === 'DRAFT').length,
        issued: records.filter((r: any) => r.status === 'ISSUED').length,
        totalAmount: records.reduce((s: number, r: any) => s + (r.totalAmount || 0), 0),
      });
    } catch { message.error('加载发票列表失败'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSave = async (vals: any) => {
    setSubmitting(true);
    try {
      if (editRecord?.id) {
        await invoiceApi.update({ ...editRecord, ...vals });
      } else {
        await invoiceApi.create(vals);
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

  const columns = [
    { title: '发票号', dataIndex: 'invoiceNo', width: 140 },
    { title: '发票类型', dataIndex: 'invoiceType', width: 130, render: (v: string) => INVOICE_TYPES.find(t => t.value === v)?.label || v },
    { title: '购方名称', dataIndex: 'buyerName', ellipsis: true },
    { title: '金额(元)', dataIndex: 'totalAmount', width: 110, render: (v: number) => v?.toFixed(2) },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => { const s = INVOICE_STATUS.find(t => t.value === v); return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{v}</Tag>; } },
    { title: '开票日期', dataIndex: 'invoiceDate', width: 100 },
    {
      title: '操作', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditRecord(r); form.setFieldsValue(r); setFormOpen(true); }}>编辑</Button>
          {r.status === 'DRAFT' && <Button size="small" type="link" onClick={() => handleIssue(r.id)}>开票</Button>}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="草稿" value={stats.draft} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已开票" value={stats.issued} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={12}><Card size="small"><Statistic title="总金额(元)" value={stats.totalAmount.toFixed(2)} /></Card></Col>
      </Row>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); form.resetFields(); setFormOpen(true); }}>新建发票</Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={list} loading={loading} size="small"
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
              <Input placeholder="开票后填入" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="购方名称">
            <Form.Item name="buyerName" noStyle rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="金额(元)">
            <Form.Item name="totalAmount" noStyle rules={[{ required: true }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="开票日期">
            <Form.Item name="invoiceDate" noStyle>
              <Input placeholder="YYYY-MM-DD" />
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
  const [stats, setStats] = useState<any>({ pendingAmount: 0, overdueAmount: 0, paidAmount: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listData, statsData] = await Promise.all([
        payableApi.list({ page, size: 20 }),
        payableApi.stats(),
      ]);
      setList((listData as any)?.records || listData || []);
      setTotal((listData as any)?.total || 0);
      setStats(statsData || {});
    } catch { message.error('加载应付账款失败'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkPaid = async (id: string) => {
    try {
      await payableApi.markPaid(id);
      message.success('已标记为已付款');
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const columns = [
    { title: '应付单号', dataIndex: 'payableNo', width: 140 },
    { title: '供应商', dataIndex: 'supplierName', ellipsis: true },
    { title: '应付金额(元)', dataIndex: 'amount', width: 120, render: (v: number) => v?.toFixed(2) },
    { title: '已付金额(元)', dataIndex: 'paidAmount', width: 120, render: (v: number) => (v || 0).toFixed(2) },
    { title: '到期日', dataIndex: 'dueDate', width: 100 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => { const s = PAYABLE_STATUS.find(t => t.value === v); return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{v}</Tag>; }
    },
    {
      title: '操作', width: 90,
      render: (_: any, r: any) => r.status === 'PENDING' && (
        <Popconfirm title="确认标记为已付款？" onConfirm={() => handleMarkPaid(r.id)}>
          <Button size="small" type="link" icon={<CheckCircleOutlined />}>付款</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="待付款(元)" value={(stats.pendingAmount || 0).toFixed(2)} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="已逾期(元)" value={(stats.overdueAmount || 0).toFixed(2)} valueStyle={{ color: '#f5222d' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="本月已付(元)" value={(stats.paidAmount || 0).toFixed(2)} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>
      <Table rowKey="id" columns={columns} dataSource={list} loading={loading} size="small"
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }} />
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
      setList(data || []);
    } catch { message.error('加载税率配置失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSave = async (vals: any) => {
    setSubmitting(true);
    try {
      if (editRecord?.id) {
        await taxConfigApi.update({ ...editRecord, ...vals });
      } else {
        await taxConfigApi.create(vals);
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
    { title: '税率(%)', dataIndex: 'taxRate', width: 100, render: (v: number) => `${v}%` },
    { title: '适用范围', dataIndex: 'appScope', ellipsis: true },
    { title: '状态', dataIndex: 'isActive', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    {
      title: '操作', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditRecord(r); form.setFieldsValue(r); setFormOpen(true); }}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); form.resetFields(); setFormOpen(true); }}>新增税率</Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={list} loading={loading} size="small" pagination={false} />
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
          <ModalFieldRow label="适用范围">
            <Form.Item name="appScope" noStyle><Input placeholder="如：一般纳税人、小规模纳税人" /></Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="是否启用">
            <Form.Item name="isActive" noStyle><Select options={[{ value: true, label: '启用' }, { value: false, label: '停用' }]} /></Form.Item>
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
    <div style={{ maxWidth: 860 }}>
      {!subscribed && (
        <Alert type="info" showIcon icon={<UnlockOutlined />} style={{ marginBottom: 16 }}
          message="通用标准格式永久免费"
          description={<span>适合手工导入任意财务软件。如需金蝶/用友专用格式，可开通
            <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => navigate(paths.appStore)}>财税对接模块（¥499/月）</Button>
          </span>} />
      )}
      {subscribed && (
        <Alert type="success" showIcon
          icon={subscriptionType === 'FREE' ? <span style={{ fontSize: 16 }}>🎁</span> : <RocketOutlined />}
          style={{ marginBottom: 16 }}
          message={subscriptionType === 'FREE' ? '新开户赠送已激活 · 财税对接模块（1年免费）' : '已开通财税对接模块'}
          description={subscriptionType === 'FREE' ? '恭喜！金蝶 KIS / 用友 T3 专用格式均已为您解锁，有效期1年。' : '金蝶 KIS / 用友 T3 专用格式均已解锁。'} />
      )}
      <Card title="第一步：选择导出格式" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          {FORMAT_OPTIONS.map(opt => {
            const locked = !opt.free && !subscribed;
            const selected = format === opt.value;
            return (
              <Col span={8} key={opt.value}>
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
            <Col span={12} key={type.key}>
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
          <Text type="secondary" style={{ fontSize: 12 }}>导出文件为 .xlsx 格式 · 金蝶/用友格式支持直接在凭证录入界面粘贴导入</Text>
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
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
