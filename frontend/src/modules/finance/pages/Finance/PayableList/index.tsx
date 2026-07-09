import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/usePerformance';
import {
  CheckCircleOutlined, DollarOutlined, ExclamationCircleOutlined,
  PlusOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import payableApi, { type Payable, type PayableStats } from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import { confirmDelete } from '@/utils/confirm';
import type { ApiResult } from '@/utils/api';
import { toMoneyLocale } from '@/utils/format';
import { useSync } from '@/utils/syncManager';

const { Text } = Typography;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待付款', color: 'blue' },
  PARTIAL:  { label: '部分付款', color: 'orange' },
  PAID:     { label: '已全额付款', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

const CreatePayableModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleClose = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload: Payable = {
        supplierId: values.supplierId ?? '',
        supplierName: values.supplierName,
        orderNo: values.orderNo,
        amount: values.amount,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
        description: values.description,
      };
      await payableApi.create(payload);
      message.success('应付单创建成功');
      onSuccess();
      handleClose();
    } catch {
      message.error('创建失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title="新建应付单"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={saving}
      width="40vw"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="supplierName" label="供应商/对方名称" rules={[{ required: true }]}>
              <Input placeholder="供应商公司全称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="orderNo" label="关联订单号">
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="amount" label="应付金额（元）" rules={[{ required: true }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="dueDate" label="到期日期">
              <DatePicker style={{ width: '100%' }} placeholder="选择到期日期" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="备注">
          <Input.TextArea id="description" rows={3} placeholder="备注说明" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

const MarkPaidModal: React.FC<{
  open: boolean;
  record: Payable | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, record, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const remaining = record
    ? (Number(record.amount) - Number(record.paidAmount ?? 0))
    : 0;

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({ amount: remaining });
    }
  }, [open, record, form, remaining]);

  const handleClose = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleOk = async () => {
    const { amount } = await form.validateFields();
    if (!record?.id) return;
    setSaving(true);
    try {
      await payableApi.markPaid(record.id, amount);
      message.success('付款金额已登记');
      onSuccess();
      handleClose();
    } catch {
      message.error('登记失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SmallModal
      title="登记付款"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={saving}
    >
      {record && (
        <div style={{ marginTop: 16 }}>
          <Descriptions column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="供应商">{record.supplierName}</Descriptions.Item>
            <Descriptions.Item label="应付金额">¥ {toMoneyLocale(record.amount)}</Descriptions.Item>
            <Descriptions.Item label="已付金额">¥ {toMoneyLocale(record.paidAmount)}</Descriptions.Item>
            <Descriptions.Item label="待付余额"><Text type="warning">¥ {toMoneyLocale(remaining)}</Text></Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item
              name="amount"
              label="本次付款金额（元）"
              rules={[
                { required: true, message: '请输入付款金额' },
                { type: 'number', min: 0.01, message: '金额必须大于0' },
              ]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
          </Form>
        </div>
      )}
    </SmallModal>
  );
};

const PayableDetailModal: React.FC<{
  open: boolean;
  payableId?: string;
  onClose: () => void;
}> = ({ open, payableId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Payable | null>(null);

  useEffect(() => {
    if (!open || !payableId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    void payableApi.list({ page: 1, pageSize: 100 })
      .then((res: ApiResult) => {
        const data = (res?.data ?? res) as Record<string, unknown> | undefined;
        const records = (data?.records as Payable[]) ?? [];
        const found = records.find((r: Payable) => r.id === payableId);
        setDetail(found ?? null);
      })
      .catch(() => {
        message.error('加载应付详情失败');
      })
      .finally(() => setLoading(false));
  }, [open, payableId]);

  return (
    <ResizableModal
      title={`应付详情${detail?.payableNo ? ` - ${detail.payableNo}` : ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width="56vw"
      destroyOnHidden
    >
      <div style={{ marginTop: 16 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="供应商/对方名称">{detail?.supplierName || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联订单">{detail?.orderNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源业务">
            {detail?.orderId ? <Tag color="purple">采购订单</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="来源单号">{detail?.orderNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="应付金额">¥ {toMoneyLocale(detail?.amount)}</Descriptions.Item>
          <Descriptions.Item label="已付金额">¥ {toMoneyLocale(detail?.paidAmount)}</Descriptions.Item>
          <Descriptions.Item label="待付余额">
            ¥ {toMoneyLocale((Number(detail?.amount ?? 0) - Number(detail?.paidAmount ?? 0)))}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {detail?.status ? <Tag color={(STATUS_CONFIG[detail.status] ?? { color: 'default' }).color}>{(STATUS_CONFIG[detail.status] ?? { label: detail.status }).label}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="到期日">{detail?.dueDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{detail?.createTime?.substring(0, 16) || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{detail?.description || '-'}</Descriptions.Item>
        </Descriptions>
      </div>
    </ResizableModal>
  );
};

const PayableList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<Payable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PayableStats>({ pendingAmount: 0, overdueAmount: 0, overdueCount: 0, paidAmount: 0, newThisMonth: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Payable | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPayableId, setDetailPayableId] = useState<string>();

  const fetchList = useCallback(async (
    page = pagination.current,
    st = statusFilter,
    kw = debouncedKeyword,
  ) => {
    setLoading(true);
    try {
      const res: ApiResult = await payableApi.list({
        page,
        pageSize: pagination.pageSize,
        status: (st as any) || undefined,
        keyword: kw || undefined,
      });
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setRecords((data?.records as Payable[]) ?? []);
      setTotal((data?.total as number) ?? 0);
    } catch {
      message.error('加载应付账款列表失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, pagination.pageSize, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res: any = await payableApi.stats();
      const data = (res?.data ?? res) as PayableStats | undefined;
      setStats(data ?? { pendingAmount: 0, overdueAmount: 0, overdueCount: 0, paidAmount: 0, newThisMonth: 0 });
    } catch (err) { console.error('统计加载失败:', err); /* 不影响主流程 */ }
  }, []);

  useEffect(() => {
    const initialStatus = searchParams.get('status') || '';
    const initialKeyword = searchParams.get('keyword') || '';
    const initialPayableId = searchParams.get('payableId') || undefined;
    setStatusFilter(initialStatus);
    setKeyword(initialKeyword);
    setDetailPayableId(initialPayableId);
    setDetailOpen(Boolean(initialPayableId));
    fetchList(1, initialStatus, initialKeyword);
    fetchStats();
  }, [fetchList, fetchStats, searchParams]);

  // 60s 轮询刷新应付列表+统计
  useSync(
    'payable-list',
    async () => {
      try {
        await Promise.all([fetchList(), fetchStats()]);
      } catch (err) { console.error('轮询同步失败:', err); /* 轮询失败忽略 */ }
      return null;
    },
    () => {},
    { interval: 60000, pauseOnHidden: true },
  );

  // 监听 data:changed 事件，500ms 防抖后刷新列表+统计
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        Promise.all([fetchList(), fetchStats()]).catch((err) => {
          console.error('事件刷新失败:', err);
        });
      }, 500);
    };
    window.addEventListener('data:changed', handleChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('data:changed', handleChange);
    };
  }, [fetchList, fetchStats]);

  const openPayableDetail = useCallback((record: Payable) => {
    if (!record.id) {
      return;
    }
    setDetailPayableId(record.id);
    setDetailOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('payableId', record.id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closePayableDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailPayableId(undefined);
    const next = new URLSearchParams(searchParams);
    next.delete('payableId');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const handleDelete = (record: Payable) => {
    confirmDelete(`应付单「${record.payableNo}」`, async () => {
      fetchList(pagination.current);
      fetchStats();
    });
  };

  const columns: ColumnsType<Payable> = [
    {
      title: '应付单号',
      dataIndex: 'payableNo',
      width: 160,
      render: (v, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openPayableDetail(record)}>
          <Text code style={{ fontSize: 14 }}>{v || '-'}</Text>
        </Button>
      ),
    },
    { title: '供应商/对方名称', dataIndex: 'supplierName', width: 180 },
    { title: '关联订单', dataIndex: 'orderNo', width: 140, render: v => v || '-' },
    {
      title: '来源业务',
      dataIndex: 'orderId',
      width: 120,
      render: (v?: string) => v ? <Tag color="purple">采购订单</Tag> : '-',
    },
    { title: '来源单号', dataIndex: 'orderNo', width: 160, render: v => v || '-' },
    {
      title: '应付金额', dataIndex: 'amount', width: 120, align: 'right',
      render: v => <Text strong>¥ {toMoneyLocale(v)}</Text>,
    },
    {
      title: '已付金额', dataIndex: 'paidAmount', width: 120, align: 'right',
      render: v => <Text type="success">¥ {toMoneyLocale(v)}</Text>,
    },
    {
      title: '待付余额', width: 120, align: 'right',
      render: (_, r) => {
        const rem = Number(r.amount) - Number(r.paidAmount ?? 0);
        return <Text type={rem > 0 ? 'warning' : 'secondary'}>¥ {toMoneyLocale(rem)}</Text>;
      },
    },
    {
      title: '到期日', dataIndex: 'dueDate', width: 110,
      render: v => {
        if (!v) return '-';
        const isOverdue = new Date(v) < new Date();
        return <Text type={isOverdue ? 'danger' : undefined}>{v}</Text>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: v => {
        const cfg = STATUS_CONFIG[v] ?? { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'createTime', width: 150, render: v => v?.substring(0, 16) ?? '-' },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, record) => {
        const canPay = record.status === 'PENDING' || record.status === 'PARTIAL' || record.status === 'OVERDUE';
        const actions: RowAction[] = [
          {
            key: 'detail',
            label: '应付详情',
            onClick: () => openPayableDetail(record),
          },
          ...(canPay ? [{
            key: 'pay',
            label: '登记付款',
            primary: true,
            onClick: () => { setActiveRecord(record); setPaidOpen(true); },
          }] : []),
          {
            key: 'delete',
            label: '删除',
            danger: true,
            disabled: record.status === 'PAID',
            onClick: () => handleDelete(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  const totalAmount = records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <>
      <div style={{ padding: 24 }}>
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="待付款合计"
                value={Number(stats.pendingAmount)}
                precision={2}
                prefix={<DollarOutlined />}
                styles={{ content: { color: 'var(--color-primary)' } }}
                formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已付款金额"
                value={Number(stats.paidAmount)}
                precision={2}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: 'var(--color-success)' } }}
                formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="逾期笔数"
                value={stats.overdueCount}
                prefix={<ExclamationCircleOutlined />}
                styles={{ content: { color: 'var(--color-warning)' } }}
                suffix="笔"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="合计金额"
                value={totalAmount}
                precision={2}
                prefix={<DollarOutlined />}
                styles={{ content: { color: 'var(--color-text-primary)' } }}
                formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
              />
            </Card>
          </Col>
        </Row>

        {stats.overdueCount > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            title={`有 ${stats.overdueCount} 笔应付款已逾期，共 ¥${toMoneyLocale(Number(stats.overdueAmount))}，请及时处理。`}
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Space>
                <Select
                  value={statusFilter}
                  onChange={v => {
                    setStatusFilter(v);
                    setPagination(p => ({ ...p, current: 1 }));
                    fetchList(1, v, keyword);
                  }}
                  style={{ width: 140 }}
                  options={[
                    { value: '', label: '全部状态' },
                    { value: 'PENDING', label: '待付款' },
                    { value: 'PARTIAL', label: '部分付款' },
                    { value: 'OVERDUE', label: '已逾期' },
                    { value: 'PAID', label: '已全额付款' },
                  ]}
                />
                <Input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onPressEnter={() => fetchList(1, statusFilter, keyword)}
                  placeholder="单号/供应商/订单"
                  style={{ width: 220 }}
                  allowClear
                />
                <Button onClick={() => fetchList(1, statusFilter, keyword)}>
                  查询
                </Button>
              </Space>
            </Col>
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建应付单
              </Button>
            </Col>
          </Row>
        </Card>

        <Card styles={{ body: { padding: 0 } }}>
          <ResizableTable
            rowKey="id"
            columns={columns}
            dataSource={records}
            loading={loading}
            stickyHeader
            scroll={{ x: 1400 }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              showTotal: t => `共 ${t} 条`,
            }}
            onChange={p => {
              const page = (p as any).current ?? 1;
              setPagination({ current: page, pageSize: (p as any).pageSize ?? 20 });
              fetchList(page, statusFilter, keyword);
            }}
            showExport={true}
            exportFilename="应付账款.xlsx"
            emptyDescription="暂无应付账款记录"
            emptyActionText="去创建应付单"
            onEmptyAction={() => setCreateOpen(true)}
          />
        </Card>

        <CreatePayableModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
        />

        <MarkPaidModal
          open={paidOpen}
          record={activeRecord}
          onClose={() => { setPaidOpen(false); setActiveRecord(null); }}
          onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
        />
        <PayableDetailModal
          open={detailOpen}
          payableId={detailPayableId}
          onClose={closePayableDetail}
        />
      </div>
    </>
  );
};

export default PayableList;
