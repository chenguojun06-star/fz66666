import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Form,
  InputNumber, message, Modal, Row, Select, Space, Statistic, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined, DollarOutlined, ExclamationCircleOutlined,
  PlusOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { receivableApi, type Receivable, type ReceivableStats } from '@/services/crm/customerApi';

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

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

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
      onClose();
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
      onCancel={onClose}
      confirmLoading={saving}
      width="40vw"
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="customerName" label="客户名称" rules={[{ required: true }]}>
              <Form.Item name="customerName" noStyle>
                <input
                  placeholder="客户公司全称"
                  className="ant-input"
                  style={{ width: '100%' }}
                  onChange={e => form.setFieldValue('customerName', e.target.value)}
                />
              </Form.Item>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="orderNo" label="关联订单号">
              <input placeholder="可选" className="ant-input" style={{ width: '100%' }}
                onChange={e => form.setFieldValue('orderNo', e.target.value)} />
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
          <input placeholder="备注说明" className="ant-input" style={{ width: '100%' }}
            onChange={e => form.setFieldValue('description', e.target.value)} />
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
      form.setFieldsValue({ amount: remaining });
    } else {
      form.resetFields();
    }
  }, [open, record, form, remaining]);

  const handleOk = async () => {
    const { amount } = await form.validateFields();
    if (!record?.id) return;
    setSaving(true);
    try {
      await receivableApi.markReceived(record.id, amount);
      message.success('到账金额已登记');
      onSuccess();
      onClose();
    } catch {
      message.error('登记失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title="登记到账"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      width="30vw"
      destroyOnClose
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
          </Form>
        </div>
      )}
    </ResizableModal>
  );
};

// ─── 主页组件 ──────────────────────────────────────────────────────────────

const ReceivableList: React.FC = () => {
  const [records, setRecords] = useState<Receivable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ReceivableStats>({ totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Receivable | null>(null);

  const fetchList = useCallback(async (page = pagination.current, st = statusFilter) => {
    setLoading(true);
    try {
      const res = await receivableApi.list({ page, pageSize: pagination.pageSize, status: st || undefined });
      const data = (res as any)?.data ?? res;
      setRecords(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      message.error('加载应收账款列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await receivableApi.stats();
      const data = (res as any)?.data ?? res;
      setStats(data ?? { totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });
    } catch { /* 不影响主流程 */ }
  }, []);

  useEffect(() => {
    fetchList(1);
    fetchStats();
  }, []);

  const handleDelete = (record: Receivable) => {
    Modal.confirm({
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
    { title: '单号', dataIndex: 'receivableNo', width: 160, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '客户名称', dataIndex: 'customerName', width: 160 },
    { title: '关联订单', dataIndex: 'orderNo', width: 140, render: v => v || '-' },
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
    <Layout>
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
                valueStyle={{ color: '#1677ff' }}
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
                valueStyle={{ color: '#ff4d4f' }}
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
                valueStyle={{ color: '#fa8c16' }}
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
                valueStyle={{ color: '#52c41a' }}
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
            message={`有 ${stats.overdueCount} 笔应收款已逾期未收，共 ¥${fmt(Number(stats.totalOverdue))}，请及时催款。`}
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
                  onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, v); }}
                  style={{ width: 140 }}
                  options={[
                    { value: '', label: '全部状态' },
                    { value: 'PENDING', label: '待收款' },
                    { value: 'PARTIAL', label: '部分到账' },
                    { value: 'OVERDUE', label: '已逾期' },
                    { value: 'PAID', label: '已全额到账' },
                  ]}
                />
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
              fetchList(page);
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
      </div>
    </Layout>
  );
};

export default ReceivableList;
