import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircleOutlined, DollarOutlined, ExclamationCircleOutlined,
  PlusOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { receivableApi, type Receivable, type ReceivableReceiptLog, type ReceivableStats } from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';
import type { ApiResult } from '@/utils/api';
import { paths } from '@/routeConfig';

const { Text } = Typography;

// ─── 常量 ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待收款', color: 'blue' },
  PARTIAL:  { label: '部分到账', color: 'orange' },
  PAID:     { label: '已全额到账', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

const fmt = (n?: number | null) =>
  n == null ? '0.00' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

// ─── 新建应收单弹窗 ────────────────────────────────────────────────────────

const CreateReceivableModal: React.FC<{
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
      const payload: Receivable = {
        customerId: values.customerId ?? '',
        customerName: values.customerName,
        orderNo: values.orderNo,
        amount: values.amount,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
        description: values.description,
      };
      await receivableApi.create(payload);
      message.success('应收单创建成功');
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
      title="新建应收单"
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
            <Form.Item name="customerName" label="客户名称" rules={[{ required: true }]}>
              <Input placeholder="客户公司全称" />
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
            <Form.Item name="amount" label="应收金额（元）" rules={[{ required: true }]}>
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
          <Input id="description" placeholder="备注说明" style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ─── 登记到账弹窗 ──────────────────────────────────────────────────────────

const MarkReceivedModal: React.FC<{
  open: boolean;
  record: Receivable | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, record, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const remaining = record
    ? (Number(record.amount) - Number(record.receivedAmount ?? 0))
    : 0;

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({ amount: remaining, remark: '' });
    }
  }, [open, record, form, remaining]);

  const handleClose = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleOk = async () => {
    const { amount, remark } = await form.validateFields();
    if (!record?.id) return;
    setSaving(true);
    try {
      await receivableApi.markReceived(record.id, amount, remark);
      message.success('到账金额已登记');
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
      title="登记到账"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={saving}
    >
      {record && (
        <div style={{ marginTop: 16 }}>
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="客户">{record.customerName}</Descriptions.Item>
            <Descriptions.Item label="应收金额">¥ {fmt(record.amount)}</Descriptions.Item>
            <Descriptions.Item label="已收金额">¥ {fmt(record.receivedAmount)}</Descriptions.Item>
            <Descriptions.Item label="待收余款"><Text type="warning">¥ {fmt(remaining)}</Text></Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item
              name="amount"
              label="本次到账金额（元）"
              rules={[
                { required: true, message: '请输入到账金额' },
                { type: 'number', min: 0.01, message: '金额必须大于0' },
              ]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item name="remark" label="到账备注">
              <Input.TextArea rows={3} placeholder="选填" />
            </Form.Item>
          </Form>
        </div>
      )}
    </SmallModal>
  );
};

const ReceivableDetailModal: React.FC<{
  open: boolean;
  receivableId?: string;
  onClose: () => void;
}> = ({ open, receivableId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Receivable | null>(null);
  const [logs, setLogs] = useState<ReceivableReceiptLog[]>([]);

  useEffect(() => {
    if (!open || !receivableId) {
      setDetail(null);
      setLogs([]);
      return;
    }
    setLoading(true);
    void receivableApi.detail(receivableId)
      .then((res: ApiResult) => {
        const data = res?.data ?? res;
        setDetail(data?.receivable ?? null);
        setLogs(Array.isArray(data?.receiptLogs) ? data.receiptLogs : []);
      })
      .catch(() => {
        message.error('加载应收详情失败');
      })
      .finally(() => setLoading(false));
  }, [open, receivableId]);

  return (
    <ResizableModal
      title={`应收详情${detail?.receivableNo ? ` - ${detail.receivableNo}` : ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width="56vw"
      destroyOnHidden
    >
      <div style={{ marginTop: 16 }}>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="客户名称">{detail?.customerName || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联订单">{detail?.orderNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源业务">
            {detail?.sourceBizType === 'MATERIAL_PICKUP' ? <Tag color="purple">面辅料领取</Tag> : (detail?.sourceBizType || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="来源单号">{detail?.sourceBizNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="应收金额">¥ {fmt(detail?.amount)}</Descriptions.Item>
          <Descriptions.Item label="已收金额">¥ {fmt(detail?.receivedAmount)}</Descriptions.Item>
          <Descriptions.Item label="待收余款">
            ¥ {fmt((Number(detail?.amount ?? 0) - Number(detail?.receivedAmount ?? 0)))}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {detail?.status ? <Tag color={(STATUS_CONFIG[detail.status] ?? { color: 'default' }).color}>{(STATUS_CONFIG[detail.status] ?? { label: detail.status }).label}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="到期日">{detail?.dueDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{detail?.description || '-'}</Descriptions.Item>
        </Descriptions>
        <Card size="small" title="回款流水" style={{ marginTop: 16 }}>
          <ResizableTable
            rowKey="id"
            size="small"
            pagination={false}
            loading={loading}
            dataSource={logs}
            scroll={{ x: 720 }}
            locale={{ emptyText: '暂无回款流水' }}
            columns={[
              { title: '回款时间', dataIndex: 'receivedTime', width: 160, render: (v?: string) => v?.replace('T', ' ').substring(0, 16) || '-' },
              { title: '回款金额', dataIndex: 'receivedAmount', width: 120, align: 'right', render: (v?: number) => `¥ ${fmt(v)}` },
              { title: '操作人', dataIndex: 'operatorName', width: 120, render: (v?: string) => v || '-' },
              { title: '备注', dataIndex: 'remark', render: (v?: string) => v || '-' },
            ]}
          />
        </Card>
      </div>
    </ResizableModal>
  );
};

// ─── 主页组件 ──────────────────────────────────────────────────────────────

const ReceivableList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<Receivable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ReceivableStats>({ totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sourceBizType, setSourceBizType] = useState('');
  const [sourceBizNo, setSourceBizNo] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Receivable | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReceivableId, setDetailReceivableId] = useState<string>();

  const fetchList = useCallback(async (
    page = pagination.current,
    st = statusFilter,
    kw = keyword,
    bizType = sourceBizType,
    bizNo = sourceBizNo,
  ) => {
    setLoading(true);
    try {
      const res: ApiResult = await receivableApi.list({
        page,
        pageSize: pagination.pageSize,
        status: st || undefined,
        keyword: kw || undefined,
        sourceBizType: bizType || undefined,
        sourceBizNo: bizNo || undefined,
      });
      const data = res?.data ?? res;
      setRecords(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      message.error('加载应收账款列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, pagination.pageSize, sourceBizNo, sourceBizType, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res: ApiResult = await receivableApi.stats();
      const data = res?.data ?? res;
      setStats(data ?? { totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });
    } catch { /* 不影响主流程 */ }
  }, []);

  useEffect(() => {
    const initialStatus = searchParams.get('status') || '';
    const initialKeyword = searchParams.get('keyword') || '';
    const initialSourceBizType = searchParams.get('sourceBizType') || '';
    const initialSourceBizNo = searchParams.get('sourceBizNo') || '';
    const initialReceivableId = searchParams.get('receivableId') || undefined;
    setStatusFilter(initialStatus);
    setKeyword(initialKeyword);
    setSourceBizType(initialSourceBizType);
    setSourceBizNo(initialSourceBizNo);
    setDetailReceivableId(initialReceivableId);
    setDetailOpen(Boolean(initialReceivableId));
    fetchList(1, initialStatus, initialKeyword, initialSourceBizType, initialSourceBizNo);
    fetchStats();
  }, [fetchList, fetchStats, searchParams]);

  const goToMaterialPickup = useCallback((record: Receivable, tab: 'pickup' | 'payment') => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    params.set('sourceBizType', record.sourceBizType || 'MATERIAL_PICKUP');
    if (record.sourceBizNo) {
      params.set('pickupNo', record.sourceBizNo);
    }
    if (record.customerName) {
      params.set('factoryName', record.customerName);
    }
    navigate(`${paths.materialInventory}?${params.toString()}`);
  }, [navigate]);

  const openReceivableDetail = useCallback((record: Receivable) => {
    if (!record.id) {
      return;
    }
    setDetailReceivableId(record.id);
    setDetailOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('receivableId', record.id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeReceivableDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailReceivableId(undefined);
    const next = new URLSearchParams(searchParams);
    next.delete('receivableId');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const handleDelete = (record: Receivable) => {
    Modal.confirm({
      width: '30vw',
      title: `确认删除应收单「${record.receivableNo}」？`,
      content: '删除后不可恢复',
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        await receivableApi.delete(record.id!);
        message.success('已删除');
        fetchList(pagination.current);
        fetchStats();
      },
    });
  };

  const columns: ColumnsType<Receivable> = [
    {
      title: '单号',
      dataIndex: 'receivableNo',
      width: 160,
      render: (v, record) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openReceivableDetail(record)}>
          <Text code style={{ fontSize: 12 }}>{v}</Text>
        </Button>
      ),
    },
    { title: '客户名称', dataIndex: 'customerName', width: 160 },
    { title: '关联订单', dataIndex: 'orderNo', width: 140, render: v => v || '-' },
    {
      title: '来源业务',
      dataIndex: 'sourceBizType',
      width: 120,
      render: (v?: string) => v === 'MATERIAL_PICKUP' ? <Tag color="purple">面辅料领取</Tag> : (v || '-'),
    },
    {
      title: '来源单号',
      dataIndex: 'sourceBizNo',
      width: 160,
      render: (v, record) => (
        record.sourceBizType === 'MATERIAL_PICKUP' && v ? (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => goToMaterialPickup(record, 'pickup')}>
            {v}
          </Button>
        ) : (v || '-')
      ),
    },
    {
      title: '应收金额', dataIndex: 'amount', width: 120, align: 'right',
      render: v => <Text strong>¥ {fmt(v)}</Text>,
    },
    {
      title: '已收金额', dataIndex: 'receivedAmount', width: 120, align: 'right',
      render: v => <Text type="success">¥ {fmt(v)}</Text>,
    },
    {
      title: '待收余款', width: 120, align: 'right',
      render: (_, r) => {
        const rem = Number(r.amount) - Number(r.receivedAmount ?? 0);
        return <Text type={rem > 0 ? 'warning' : 'secondary'}>¥ {fmt(rem)}</Text>;
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
        const canReceive = record.status === 'PENDING' || record.status === 'PARTIAL' || record.status === 'OVERDUE';
        const actions: RowAction[] = [
          {
            key: 'detail',
            label: '应收详情',
            onClick: () => openReceivableDetail(record),
          },
          ...(record.sourceBizType === 'MATERIAL_PICKUP' ? [{
            key: 'pickup',
            label: '查看领料',
            onClick: () => goToMaterialPickup(record, 'pickup'),
          }, {
            key: 'payment-center',
            label: '查看收款汇总',
            onClick: () => goToMaterialPickup(record, 'payment'),
          }] : []),
          ...(canReceive ? [{
            key: 'receive',
            label: '登记到账',
            primary: true,
            onClick: () => { setActiveRecord(record); setReceiveOpen(true); },
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

  return (
    <>
      <div style={{ padding: 24 }}>
        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="待收款合计"
                value={Number(stats.totalPending)}
                precision={2}
                prefix={<DollarOutlined />}
                styles={{ content: { color: '#1677ff' } }}
                formatter={v => `¥ ${fmt(Number(v))}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="逾期未收合计"
                value={Number(stats.totalOverdue)}
                precision={2}
                prefix={<WarningOutlined />}
                styles={{ content: { color: '#ff4d4f' } }}
                formatter={v => `¥ ${fmt(Number(v))}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="逾期笔数"
                value={stats.overdueCount}
                prefix={<ExclamationCircleOutlined />}
                styles={{ content: { color: '#fa8c16' } }}
                suffix="笔"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="本月新增应收"
                value={stats.newThisMonth}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: '#52c41a' } }}
                suffix="笔"
              />
            </Card>
          </Col>
        </Row>

        {/* 逾期提示 */}
        {stats.overdueCount > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            title={`有 ${stats.overdueCount} 笔应收款已逾期未收，共 ¥${fmt(Number(stats.totalOverdue))}，请及时催款。`}
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        {/* 过滤栏 */}
        <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Space>
                <Select
                  value={statusFilter}
                  onChange={v => {
                    setStatusFilter(v);
                    setPagination(p => ({ ...p, current: 1 }));
                    fetchList(1, v, keyword, sourceBizType, sourceBizNo);
                  }}
                  style={{ width: 140 }}
                  options={[
                    { value: '', label: '全部状态' },
                    { value: 'PENDING', label: '待收款' },
                    { value: 'PARTIAL', label: '部分到账' },
                    { value: 'OVERDUE', label: '已逾期' },
                    { value: 'PAID', label: '已全额到账' },
                  ]}
                />
                <Select
                  value={sourceBizType}
                  onChange={v => {
                    setSourceBizType(v);
                    setPagination(p => ({ ...p, current: 1 }));
                    fetchList(1, statusFilter, keyword, v, sourceBizNo);
                  }}
                  style={{ width: 160 }}
                  options={[
                    { value: '', label: '全部来源' },
                    { value: 'MATERIAL_PICKUP', label: '面辅料领取' },
                  ]}
                />
                <Input
                  value={sourceBizNo}
                  onChange={e => setSourceBizNo(e.target.value)}
                  onPressEnter={() => fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo)}
                  placeholder="来源单号"
                  style={{ width: 180 }}
                  allowClear
                />
                <Input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onPressEnter={() => fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo)}
                  placeholder="单号/客户/订单"
                  style={{ width: 220 }}
                  allowClear
                />
                <Button onClick={() => fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo)}>
                  查询
                </Button>
              </Space>
            </Col>
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建应收单
              </Button>
            </Col>
          </Row>
        </Card>

        {/* 表格 */}
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
              fetchList(page, statusFilter, keyword, sourceBizType, sourceBizNo);
            }}
            size="small"
          />
        </Card>

        {/* 新建弹窗 */}
        <CreateReceivableModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
        />

        {/* 登记到账弹窗 */}
        <MarkReceivedModal
          open={receiveOpen}
          record={activeRecord}
          onClose={() => { setReceiveOpen(false); setActiveRecord(null); }}
          onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
        />
        <ReceivableDetailModal
          open={detailOpen}
          receivableId={detailReceivableId}
          onClose={closeReceivableDetail}
        />
      </div>
    </>
  );
};

export default ReceivableList;
