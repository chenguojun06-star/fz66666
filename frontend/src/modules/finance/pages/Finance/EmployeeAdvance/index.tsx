import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { App, Button, Card, Col, Empty, Form, Input, InputNumber, Row, Select, Space, Statistic, Tabs, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import StandardModal from '@/components/common/StandardModal';
import PageLayout from '@/components/common/PageLayout';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import type { SmartErrorInfo } from '@/smart/core/types';
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, ClockCircleOutlined, DollarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import {
  ADVANCE_STATUS,
  REPAYMENT_STATUS,
  employeeAdvanceApi,
  type EmployeeAdvance,
} from '@/services/finance/employeeAdvanceApi';

const statusTag = (val: string) => {
  const s = ADVANCE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>未知</Tag>;
};

const repaymentTag = (val: string) => {
  const s = REPAYMENT_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>未知</Tag>;
};

const EmployeeAdvancePage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [repayForm] = Form.useForm();

  const [list, setList] = useState<EmployeeAdvance[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterRepayment, setFilterRepayment] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [repayOpen, setRepayOpen] = useState(false);
  const [repayRecord, setRepayRecord] = useState<EmployeeAdvance | null>(null);
  const [repaySubmitting, setRepaySubmitting] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);

  const reportSmartError = useCallback((code: string, msg: string) => {
    setSmartError({ code, title: msg });
  }, []);

  // ===== 统计卡片数据
  const advanceStats = useMemo(() => {
    const pending = (list || []).filter((r: any) => r.status === 'pending').length;
    const approved = (list || []).filter((r: any) => r.status === 'approved').length;
    const paid = (list || []).filter((r: any) => r.repaymentStatus === 'full').length;
    const total = (list || []).reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0);
    return { pending, approved, paid, total };
  }, [list]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeeAdvanceApi.list({
        page, size: pageSize, status: filterStatus, repaymentStatus: filterRepayment, employeeName: keyword,
      });
      if (res.code === 200) {
        setList(res.data?.records || res.data?.list || []);
        setTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '查询失败');
      }
    } catch (err: unknown) {
      reportSmartError('fetch', err instanceof Error ? err.message : '查询异常');
      message.error(err instanceof Error ? err.message : '查询异常');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterRepayment, keyword, message]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const openForm = () => { form.resetFields(); setFormOpen(true); };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await employeeAdvanceApi.create(values);
      if (res.code === 200) {
        message.success('借支单创建成功');
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

  const handleApprove = (record: EmployeeAdvance) => {
    modal.confirm({
      width: '30vw',
      title: '审批通过',
      content: `确认通过 ${record.employeeName} 的借支单 ${record.advanceNo}，金额 ${formatMoney(record.amount || 0)}？`,
      okText: '确认通过',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await employeeAdvanceApi.approve(record.id!);
          if (res.code === 200) { message.success('审批通过'); void fetchList(); }
          else { message.error(res.message || '操作失败'); }
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '操作异常');
        }
      },
    });
  };

  const handleReject = (record: EmployeeAdvance) => {
    modal.confirm({
      width: '30vw',
      title: '驳回借支',
      content: `确认驳回 ${record.employeeName} 的借支单 ${record.advanceNo}？`,
      okText: '确认驳回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await employeeAdvanceApi.reject(record.id!);
          if (res.code === 200) { message.success('已驳回'); void fetchList(); }
          else { message.error(res.message || '操作失败'); }
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '操作异常');
        }
      },
    });
  };

  const openRepayModal = (record: EmployeeAdvance) => {
    setRepayRecord(record);
    repayForm.resetFields();
    repayForm.setFieldsValue({ amount: record.remainingAmount || record.amount });
    setRepayOpen(true);
  };

  const handleRepaySubmit = async () => {
    try {
      const values = await repayForm.validateFields();
      setRepaySubmitting(true);
      const res = await employeeAdvanceApi.repay(repayRecord!.id!, values.amount);
      if (res.code === 200) {
        message.success('还款成功');
        setRepayOpen(false);
        void fetchList();
      } else {
        message.error(res.message || '还款失败');
      }
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setRepaySubmitting(false);
    }
  };

  const columns: ColumnsType<EmployeeAdvance> = [
    { title: '借支单号', dataIndex: 'advanceNo', width: 150 },
    { title: '员工姓名', dataIndex: 'employeeName', width: 100, render: (val: string) => val || '-' },
    { title: '所属工厂', dataIndex: 'factoryName', width: 120, render: (val: string) => val || '-' },
    {
      title: '借支金额', dataIndex: 'amount', width: 110, align: 'right',
      render: (val: number) => <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>{formatMoney(val || 0)}</span>,
    },
    { title: '审批状态', dataIndex: 'status', width: 90, render: (val: string) => statusTag(val) },
    { title: '还款状态', dataIndex: 'repaymentStatus', width: 100, render: (val: string) => repaymentTag(val) },
    {
      title: '剩余金额', dataIndex: 'remainingAmount', width: 110, align: 'right',
      render: (val: number) => <span style={{ color: 'var(--color-warning)', fontWeight: 500 }}>{formatMoney(val || 0)}</span>,
    },
    { title: '创建时间', dataIndex: 'createTime', width: 120, render: (val: string) => val ? formatDateTime(val) : '-' },
    {
      title: '操作', key: 'actions', width: 140, fixed: 'right' as const,
      render: (_: unknown, record: EmployeeAdvance) => {
        const actions: RowAction[] = [];
        if (record.status === 'pending') {
          actions.push({ key: 'approve', label: '通过', primary: true, onClick: () => handleApprove(record) });
          actions.push({ key: 'reject', label: '驳回', danger: true, onClick: () => handleReject(record) });
        }
        if (record.status === 'approved' && record.repaymentStatus !== 'repaid') {
          actions.push({ key: 'repay', label: '还款', primary: true, onClick: () => openRepayModal(record) });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <PageLayout>
      {smartError && <SmartErrorNotice error={smartError} />}

      {/* ===== 统一统计卡片 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>} value={advanceStats.pending} suffix="件" valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>} value={advanceStats.approved} suffix="件" valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已还款</span>} value={advanceStats.paid} suffix="件" valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />合计金额</span>} value={advanceStats.total} prefix="¥" precision={2} valueStyle={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 500 }} />
        </Card>
      </div>

      <Card style={{ marginBottom: 12, borderRadius: 6, border: '1px solid var(--color-border-secondary)' }} styles={{ body: { padding: '12px 16px' } }}>
        <Tabs
          activeKey={filterStatus || ''}
          onChange={(k) => { setFilterStatus(k || undefined); setPage(1); }}
          size="small"
          items={[
            { key: '', label: `全部 (${total})` },
            { key: 'pending', label: `待审批` },
            { key: 'approved', label: `已审批` },
            { key: 'rejected', label: `已驳回` },
          ]}
        />
        <Row gutter={[12, 12]} align="middle" style={{ marginTop: 8 }}>
          <Col>
            <Select value={filterRepayment} onChange={(v) => { setFilterRepayment(v); setPage(1); }}
              allowClear placeholder="还款状态" style={{ width: 120 }} options={REPAYMENT_STATUS} />
          </Col>
          <Col>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => { setPage(1); void fetchList(); }}
              placeholder="搜索员工/单号" style={{ width: 160 }} suffix={<SearchOutlined style={{ color: 'var(--color-text-quaternary)' }} />} />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space size={8}>
              <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={openForm}>新建借支</Button>
              <Button size="small" ghost onClick={() => { void fetchList(); }}>刷新</Button>
            </Space>
          </Col>
        </Row>
      </Card>
      <ResizableTable storageKey="employee-advance" rowKey="id" columns={columns} dataSource={list}
        loading={loading} stickyHeader scroll={{ x: 1000 }}
        locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`, onChange: (p, s) => { setPage(p); setPageSize(s); } }}
      />

      <StandardModal open={formOpen} title="新建借支" onCancel={() => setFormOpen(false)} size="md"
        onOk={handleFormSubmit} okText="提交" confirmLoading={submitting}
      >
        <div style={{ padding: '0 8px' }}>
          <Form form={form} layout="vertical" requiredMark="optional">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="employeeName" label="员工姓名" rules={[{ required: true, message: '请填写员工姓名' }]}>
                  <Input placeholder="请输入员工姓名" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="amount" label="借支金额" rules={[{ required: true, message: '请填写借支金额' }]}>
                  <InputNumber min={0.01} precision={2} prefix="¥" placeholder="0.00" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="reason" label="借支事由" rules={[{ required: true, message: '请填写借支事由' }]}>
              <Input.TextArea rows={3} placeholder="请描述借支原因" />
            </Form.Item>
            <Form.Item name="orderNo" label="关联订单号">
              <Input placeholder="选填" />
            </Form.Item>
          </Form>
        </div>
      </StandardModal>

      <StandardModal open={repayOpen} title="还款" onCancel={() => setRepayOpen(false)} size="sm"
        onOk={handleRepaySubmit} okText="确认还款" confirmLoading={repaySubmitting}
      >
        <div style={{ padding: '0 8px' }}>
          {repayRecord && (
            <Card style={{ marginBottom: 16, background: 'var(--color-bg-container)', border: '1px solid var(--color-border-light)' }}>
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14, marginBottom: 4 }}>借支信息</div>
              <div style={{ fontWeight: 500 }}>{repayRecord.employeeName} · {repayRecord.advanceNo}</div>
              <div style={{ marginTop: 4 }}>
                借支金额：<span style={{ color: 'var(--color-danger)' }}>{formatMoney(repayRecord.amount || 0)}</span>
                {' / '}
                剩余：<span style={{ color: 'var(--color-warning)' }}>{formatMoney(repayRecord.remainingAmount || 0)}</span>
              </div>
            </Card>
          )}
          <Form form={repayForm} layout="vertical" requiredMark="optional">
            <Form.Item name="amount" label="还款金额" rules={[{ required: true, message: '请填写还款金额' }]}>
              <InputNumber min={0.01} max={repayRecord?.remainingAmount || repayRecord?.amount || undefined}
                precision={2} prefix="¥" placeholder="0.00" style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </div>
      </StandardModal>
    </PageLayout>
  );
};

export default EmployeeAdvancePage;
