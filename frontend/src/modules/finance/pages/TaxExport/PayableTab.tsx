import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Space, Tag, Typography, Alert, Form, Input, Select, InputNumber, Popconfirm, Statistic, DatePicker } from 'antd';
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import payableApi from '@/services/finance/payableApi';
import type { PayableStatus } from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import { PAYABLE_STATUS } from './taxExportConstants';

const { Text } = Typography;

const PayableTab: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<any>({ pendingAmount: 0, overdueAmount: 0, paidAmount: 0, overdueCount: 0, newThisMonth: 0 });
  const [filters, setFilters] = useState<{ status?: PayableStatus; keyword: string }>({ status: undefined, keyword: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    if (!formOpen) createForm.resetFields();
  }, [createForm, formOpen]);

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

  const getRemainDays = (dueDate?: string) => {
    if (!dueDate) return null;
    return dayjs(dueDate).diff(dayjs().startOf('day'), 'day');
  };

  const columns = [
    { title: '应付单号', dataIndex: 'payableNo', width: 140 },
    {
      title: '供应商', dataIndex: 'supplierName', ellipsis: true,
      render: (_: unknown, record: any) => (
        <SupplierNameTooltip
          name={record.supplierName}
          contactPerson={record.supplierContactPerson}
          contactPhone={record.supplierContactPhone}
        />
      ),
    },
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
      render: (v: string) => { const s = PAYABLE_STATUS.find(t => t.value === v); return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>未知</Tag>; },
    },
    {
      title: '操作', width: 140,
      render: (_: any, r: any) => r.status !== 'PAID' && (
        <Space>
          <Popconfirm title="全额付款？" onConfirm={() => handleMarkPaid(r.id)}>
            <Button type="link" icon={<CheckCircleOutlined />}>全额</Button>
          </Popconfirm>
          <Button type="link" onClick={() => { setPayRecord(r); setPayAmount(null); }}>部分付</Button>
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
        <Col xs={24} sm={6}><Card><Statistic title="待付款(元)" value={(stats.pendingAmount || 0).toFixed(2)} styles={{ content: { color: '#fa8c16' } }} /></Card></Col>
        <Col xs={24} sm={6}><Card><Statistic title="逾期金额(元)" value={(stats.overdueAmount || 0).toFixed(2)} styles={{ content: { color: '#f5222d' } }} suffix={stats.overdueCount ? <span style={{ fontSize: 12, color: '#f5222d' }}>/{stats.overdueCount}笔</span> : undefined} /></Card></Col>
        <Col xs={24} sm={6}><Card><Statistic title="本月已付(元)" value={(stats.paidAmount || 0).toFixed(2)} styles={{ content: { color: '#52c41a' } }} /></Card></Col>
        <Col xs={24} sm={6}><Card><Statistic title="本月新增(笔)" value={stats.newThisMonth || 0} /></Card></Col>
      </Row>
      <Card style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input allowClear prefix={<SearchOutlined />} placeholder="搜应付单号 / 供应商 / 来源单号"
              value={filters.keyword}
              onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select allowClear placeholder="状态" style={{ width: '100%' }}
              options={PAYABLE_STATUS.map(item => ({ value: item.value, label: item.label }))}
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
            />
          </Col>
          <Col xs={12} md={12} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setFilters({ status: undefined, keyword: '' }); setPage(1); }}>重置</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setFormOpen(true); }}>新建应付款</Button>
            </Space>
          </Col>
        </Row>
      </Card>
      <Alert type="info" showIcon icon={<DollarOutlined />} style={{ marginBottom: 12 }}
        title="应付账款与业务系统深度联动"
        description="对账单审核通过、工资结算批准后，相关记录自动流入应付账款。逾期应付款红色高亮；3天内到期黄色预警；支持全额或部分付款。"
      />
      <ResizableTable storageKey="finance-accounts-payable" size="small" rowKey="id" columns={columns} dataSource={list} loading={loading} scroll={{ x: 'max-content' }}
        rowClassName={rowClassName}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }}
      />
      <ResizableModal
        title="新建应付款"
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => createForm.validateFields().then(handleCreate).catch(() => {})}>保存</Button>,
        ]}
      >
        <Form form={createForm} layout="vertical" style={{ padding: '16px 0' }}>
          <ModalFieldRow label="供应商名称"><Form.Item name="supplierName" noStyle rules={[{ required: true }]}><Input /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="来源单号"><Form.Item name="orderNo" noStyle><Input placeholder="关联对账单号/采购单号（选填）" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="业务说明"><Form.Item name="description" noStyle><Input placeholder="如：1月面料采购货款" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="应付金额(元)"><Form.Item name="amount" noStyle rules={[{ required: true }]}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="付款到期日"><Form.Item name="dueDate" noStyle><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item></ModalFieldRow>
        </Form>
      </ResizableModal>
      <SmallModal
        title={`部分付款 — ${payRecord?.supplierName || ''}`}
        open={!!payRecord}
        onCancel={() => setPayRecord(null)}
        onOk={() => {
          if (!payAmount || payAmount <= 0) { message.warning('请输入付款金额'); return; }
          handleMarkPaid(payRecord.id, payAmount);
        }}
        okText="确认付款"
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
      </SmallModal>
    </>
  );
};

export default PayableTab;
