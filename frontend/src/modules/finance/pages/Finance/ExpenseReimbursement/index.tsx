import React, { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, DatePicker, Form, Input, InputNumber, Modal,
  Select, Space, Tag, Tooltip, Popconfirm, Row, Col, Statistic,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  PlusOutlined, SearchOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DollarOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalField, ModalFieldRow } from '@/components/common/ModalContentLayout';
import { useAuth } from '@/utils/AuthContext';
import {
  expenseReimbursementApi,
  EXPENSE_TYPES,
  EXPENSE_STATUS,
  PAYMENT_METHODS,
  type ExpenseReimbursement,
} from '@/services/finance/expenseReimbursementApi';
import SupplierSelect from '@/components/common/SupplierSelect';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { TextArea } = Input;

/** 费用类型 label 映射 */
const typeLabel = (val: string) => EXPENSE_TYPES.find(t => t.value === val)?.label || val;
/** 状态 Tag */
const statusTag = (val: string) => {
  const s = EXPENSE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{val}</Tag>;
};

const ExpenseReimbursementPage: React.FC = () => {
  const { user } = useAuth();
  const { message, modal } = App.useApp();

  // ── 列表状态 ──
  const [list, setList] = useState<ExpenseReimbursement[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterType, setFilterType] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');

  // ── 表单弹窗状态 ──
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExpenseReimbursement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // ── 审批弹窗 ──
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveRecord, setApproveRecord] = useState<ExpenseReimbursement | null>(null);
  const [approveRemark, setApproveRemark] = useState('');

  // ── 详情弹窗 ──
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ExpenseReimbursement | null>(null);

  // ── 视图切换：my=我的报销  all=全部（审批人视角） ──
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');

  // ── 统计 ──
  const [stats, setStats] = useState({ pending: 0, totalAmount: 0, paidAmount: 0 });
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  // ── 加载数据 ──
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, size: pageSize };
      if (viewMode === 'my' && user?.id) {
        params.applicantId = String(user.id);
      }
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.expenseType = filterType;
      if (keyword.trim()) params.keyword = keyword.trim();

      const res = await expenseReimbursementApi.getList(params);
      if (res.code === 200 && res.data) {
        setList(res.data.records || []);
        setTotal(res.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);

        // 简易统计
        const records: ExpenseReimbursement[] = res.data.records || [];
        const pendingCount = records.filter(r => r.status === 'pending').length;
        const totalAmt = records.reduce((s, r) => s + (r.amount || 0), 0);
        const paidAmt = records.filter(r => r.status === 'paid')
          .reduce((s, r) => s + (r.amount || 0), 0);
        setStats({ pending: pendingCount, totalAmount: totalAmt, paidAmount: paidAmt });
      } else {
        const errMessage = res.message || '加载报销列表失败';
        reportSmartError('费用报销列表加载失败', errMessage, 'EXPENSE_LIST_LOAD_FAILED');
        message.error(errMessage);
      }
    } catch (err: any) {
      reportSmartError('费用报销列表加载失败', err?.message || '网络异常或服务不可用，请稍后重试', 'EXPENSE_LIST_LOAD_EXCEPTION');
      message.error(`加载报销列表失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterType, keyword, viewMode, user?.id, message]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ── 新建/编辑 ──
  const openForm = (record?: ExpenseReimbursement) => {
    if (record) {
      setEditingRecord(record);
      form.setFieldsValue({
        ...record,
        expenseDate: record.expenseDate ? dayjs(record.expenseDate) : undefined,
      });
    } else {
      setEditingRecord(null);
      form.resetFields();
      form.setFieldsValue({ paymentMethod: 'bank_transfer' });
    }
    setFormOpen(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const data: Partial<ExpenseReimbursement> = {
        ...values,
        expenseDate: values.expenseDate?.format('YYYY-MM-DD'),
      };

      let res;
      if (editingRecord?.id) {
        data.id = editingRecord.id;
        res = await expenseReimbursementApi.update(data as ExpenseReimbursement);
      } else {
        res = await expenseReimbursementApi.create(data as ExpenseReimbursement);
      }

      if (res.code === 200) {
        message.success(editingRecord ? '更新成功' : '提交成功');
        setFormOpen(false);
        fetchList();
      } else {
        reportSmartError('报销单提交失败', res.message || '请检查表单后重试', 'EXPENSE_FORM_SUBMIT_FAILED');
        message.error(res.message || '操作失败');
      }
    } catch (err: any) {
      if (err?.errorFields?.length) {
        return;
      }
      reportSmartError('报销单提交失败', err?.message || '网络异常或服务不可用，请稍后重试', 'EXPENSE_FORM_SUBMIT_EXCEPTION');
      message.error(err?.message || '报销单提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 删除 ──
  const handleDelete = async (id: string) => {
    try {
      const res = await expenseReimbursementApi.delete(id);
      if (res.code === 200) {
        message.success('删除成功');
        fetchList();
      } else {
        reportSmartError('报销单删除失败', res.message || '请稍后重试', 'EXPENSE_DELETE_FAILED');
        message.error(res.message || '删除失败');
      }
    } catch (err: any) {
      reportSmartError('报销单删除失败', err?.message || '网络异常或服务不可用，请稍后重试', 'EXPENSE_DELETE_EXCEPTION');
      message.error(`删除报销单失败: ${err?.message || '未知错误'}`);
    }
  };

  // ── 审批 ──
  const openApprove = (record: ExpenseReimbursement) => {
    setApproveRecord(record);
    setApproveRemark('');
    setApproveOpen(true);
  };

  const handleApprove = async (action: 'approve' | 'reject') => {
    if (!approveRecord?.id) return;
    if (action === 'reject' && !approveRemark.trim()) {
      message.warning('驳回时请填写原因');
      return;
    }
    try {
      const res = await expenseReimbursementApi.approve(approveRecord.id, action, approveRemark);
      if (res.code === 200) {
        message.success(action === 'approve' ? '已批准' : '已驳回');
        setApproveOpen(false);
        fetchList();
      } else {
        reportSmartError('报销单审批失败', res.message || '请稍后重试', 'EXPENSE_APPROVE_FAILED');
        message.error(res.message || '操作失败');
      }
    } catch (err: any) {
      reportSmartError('报销单审批失败', err?.message || '网络异常或服务不可用，请稍后重试', 'EXPENSE_APPROVE_EXCEPTION');
      message.error(`审批失败: ${err?.message || '未知错误'}`);
    }
  };

  // ── 确认付款 ──
  const handlePay = (record: ExpenseReimbursement) => {
    modal.confirm({
      title: '确认付款',
      content: (
        <div>
          <p>报销单号：{record.reimbursementNo}</p>
          <p>申请人：{record.applicantName}</p>
          <p>金额：<strong style={{ color: 'var(--color-danger)', fontSize: 16 }}>¥{record.amount?.toFixed(2)}</strong></p>
          <p>收款方式：{PAYMENT_METHODS.find(m => m.value === record.paymentMethod)?.label || record.paymentMethod}</p>
          <p>收款账号：{record.paymentAccount}</p>
          <p>收款户名：{record.accountName}</p>
          {record.bankName && <p>开户银行：{record.bankName}</p>}
        </div>
      ),
      okText: '确认已付款',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await expenseReimbursementApi.pay(record.id!);
          if (res.code === 200) {
            message.success('已确认付款');
            fetchList();
          } else {
            reportSmartError('报销单付款确认失败', res.message || '请稍后重试', 'EXPENSE_PAY_CONFIRM_FAILED');
            message.error(res.message || '操作失败');
          }
        } catch (err: any) {
          reportSmartError('报销单付款确认失败', err?.message || '网络异常或服务不可用，请稍后重试', 'EXPENSE_PAY_CONFIRM_EXCEPTION');
          message.error(err?.message || '付款确认失败');
        }
      },
    });
  };

  // ── 查看详情 ──
  const openDetail = (record: ExpenseReimbursement) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  // ── 表格列 ──
  const columns: ColumnsType<ExpenseReimbursement> = [
    {
      title: '报销单号', dataIndex: 'reimbursementNo', width: 160,
      render: (text: string, record: ExpenseReimbursement) => (
        <a onClick={() => openDetail(record)}>{text}</a>
      ),
    },
    { title: '事由', dataIndex: 'title', width: 180, ellipsis: true },
    {
      title: '类型', dataIndex: 'expenseType', width: 110,
      render: (val: string) => typeLabel(val),
    },
    {
      title: '金额', dataIndex: 'amount', width: 110, align: 'right',
      render: (val: number) => <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>¥{(val || 0).toFixed(2)}</span>,
    },
    {
      title: '费用日期', dataIndex: 'expenseDate', width: 110,
      render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD') : '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (val: string) => statusTag(val),
    },
    ...(viewMode === 'all' ? [{
      title: '申请人' as const,
      dataIndex: 'applicantName' as const,
      width: 90,
    }] : []),
    {
      title: '审批人', dataIndex: 'approverName', width: 90,
      render: (val: string) => val || '-',
    },
    {
      title: '提交时间', dataIndex: 'createTime', width: 150,
      render: (val: string) => val ? dayjs(val).format('MM-DD HH:mm') : '-',
    },
    {
      title: '操作', key: 'actions', width: 180, fixed: 'right' as const,
      render: (_: unknown, record: ExpenseReimbursement) => {
        const actions: React.ReactNode[] = [];

        // 自己的待审批/已驳回单据可以编辑、删除
        if (record.applicantId === Number(user?.id) && (record.status === 'pending' || record.status === 'rejected')) {
          actions.push(
            <Tooltip title="编辑" key="edit">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openForm(record)} />
            </Tooltip>,
          );
          actions.push(
            <Popconfirm key="del" title="确定删除该报销单？" onConfirm={() => handleDelete(record.id!)}>
              <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>,
          );
        }

        // 全部视图下，审批人可审批待审批的（非自己的）单据
        if (viewMode === 'all' && record.status === 'pending' && record.applicantId !== Number(user?.id)) {
          actions.push(
            <Tooltip title="审批" key="approve">
              <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => openApprove(record)}>审批</Button>
            </Tooltip>,
          );
        }

        // 全部视图下，已批准可确认付款
        if (viewMode === 'all' && record.status === 'approved') {
          actions.push(
            <Tooltip title="确认付款" key="pay">
              <Button type="link" size="small" style={{ color: 'var(--color-success)' }} icon={<DollarOutlined />} onClick={() => handlePay(record)}>付款</Button>
            </Tooltip>,
          );
        }

        actions.push(
          <Tooltip title="详情" key="detail">
            <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
          </Tooltip>,
        );

        return <Space size={0}>{actions}</Space>;
      },
    },
  ];

  // 监听费用类型以动态显示关联字段
  const expenseTypeValue = Form.useWatch('expenseType', form);

  return (
    <Layout>
      <div style={{ padding: '0 0 24px' }}>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 16 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                void fetchList();
              }}
            />
          </Card>
        ) : null}

        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Card size="small"><Statistic title="待审批" value={stats.pending} suffix="件" styles={{ content: { color: 'var(--color-warning)' } }} /></Card>
          </Col>
          <Col span={8}>
            <Card size="small"><Statistic title="本页总金额" value={stats.totalAmount} prefix="¥" precision={2} /></Card>
          </Col>
          <Col span={8}>
            <Card size="small"><Statistic title="已付款金额" value={stats.paidAmount} prefix="¥" precision={2} styles={{ content: { color: 'var(--color-success)' } }} /></Card>
          </Col>
        </Row>

        {/* 工具栏 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[12, 12]} align="middle">
            <Col>
              <Select
                value={viewMode}
                onChange={(v) => { setViewMode(v); setPage(1); }}
                style={{ width: 130 }}
                options={[
                  { value: 'my', label: '我的报销' },
                  { value: 'all', label: '全部报销（审批）' },
                ]}
              />
            </Col>
            <Col>
              <Select
                value={filterStatus}
                onChange={(v) => { setFilterStatus(v); setPage(1); }}
                allowClear placeholder="状态筛选" style={{ width: 120 }}
                options={EXPENSE_STATUS}
              />
            </Col>
            <Col>
              <Select
                value={filterType}
                onChange={(v) => { setFilterType(v); setPage(1); }}
                allowClear placeholder="费用类型" style={{ width: 130 }}
                options={EXPENSE_TYPES}
              />
            </Col>
            <Col>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => { setPage(1); fetchList(); }}
                placeholder="搜索事由" style={{ width: 160 }}
                suffix={<SearchOutlined style={{ color: '#bbb' }} />}
              />
            </Col>
            <Col flex="auto" style={{ textAlign: 'right' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
                新建报销
              </Button>
            </Col>
          </Row>
        </Card>

        {/* 列表 */}
        <ResizableTable
          storageKey="expense-reimbursement"
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
          }}
        />
      </div>

      {/* ────── 新建/编辑弹窗 ────── */}
      <ResizableModal
        open={formOpen}
        title={editingRecord ? '编辑报销单' : '新建报销单'}
        onCancel={() => setFormOpen(false)}
        width="40vw"
        centered
        footer={
          <Space>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleFormSubmit}>
              {editingRecord ? '更新' : '提交报销'}
            </Button>
          </Space>
        }
      >
        <div style={{ padding: '0 8px' }}>
          <Form form={form} layout="vertical" requiredMark="optional">
            <Form.Item name="expenseType" label="费用类型" rules={[{ required: true, message: '请选择费用类型' }]}>
              <Select options={EXPENSE_TYPES} placeholder="请选择" />
            </Form.Item>

            <Form.Item name="title" label="报销事由" rules={[{ required: true, message: '请填写报销事由' }]}>
              <Input placeholder="如：出差往返打车费" />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="amount" label="报销金额" rules={[{ required: true, message: '请填写金额' }]}>
                  <InputNumber min={0.01} precision={2} prefix="¥" placeholder="0.00" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="expenseDate" label="费用日期" rules={[{ required: true, message: '请选择日期' }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            {/* 面辅料垫付时显示关联字段 */}
            {expenseTypeValue === 'material_advance' && (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="orderNo" label="关联订单号">
                    <Input placeholder="选填" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="supplierName" label="供应商名称">
                    <SupplierSelect
                      placeholder="选填"
                      onChange={(value, option) => {
                        form.setFieldsValue({
                          supplierName: value,
                          supplierId: option?.supplierId,
                          supplierContactPerson: option?.supplierContactPerson,
                          supplierContactPhone: option?.supplierContactPhone
                        });
                      }}
                    />
                  </Form.Item>
                  {/* 隐藏字段：供应商ID和联系信息 */}
                  <Form.Item name="supplierId" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name="supplierContactPerson" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name="supplierContactPhone" hidden>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Form.Item name="description" label="详细说明">
              <TextArea rows={3} placeholder="详细描述费用用途、原因等" />
            </Form.Item>

            <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0 8px', paddingTop: 12 }}>
              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>收款信息</span>
            </div>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="paymentMethod" label="收款方式" rules={[{ required: true }]}>
                  <Select options={PAYMENT_METHODS} placeholder="请选择" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="accountName" label="收款户名" rules={[{ required: true, message: '请填写收款户名' }]}>
                  <Input placeholder="收款人姓名" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="paymentAccount" label="收款账号" rules={[{ required: true, message: '请填写收款账号' }]}>
              <Input placeholder="银行卡号/支付宝/微信账号" />
            </Form.Item>

            <Form.Item name="bankName" label="开户银行">
              <Input placeholder="银行转账时填写开户行（选填）" />
            </Form.Item>
          </Form>
        </div>
      </ResizableModal>

      {/* ────── 审批弹窗 ────── */}
      <Modal
        open={approveOpen}
        title="审批报销单"
        onCancel={() => setApproveOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setApproveOpen(false)}>取消</Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={() => handleApprove('reject')}>驳回</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove('approve')}>批准</Button>
          </Space>
        }
      >
        {approveRecord && (
          <div>
            <p><strong>报销单号：</strong>{approveRecord.reimbursementNo}</p>
            <p><strong>申请人：</strong>{approveRecord.applicantName}</p>
            <p><strong>事由：</strong>{approveRecord.title}</p>
            <p><strong>类型：</strong>{typeLabel(approveRecord.expenseType)}</p>
            <p>
              <strong>金额：</strong>
              <span style={{ color: 'var(--color-danger)', fontSize: 18, fontWeight: 600 }}>
                ¥{approveRecord.amount?.toFixed(2)}
              </span>
            </p>
            <p><strong>费用日期：</strong>{approveRecord.expenseDate}</p>
            {approveRecord.description && <p><strong>说明：</strong>{approveRecord.description}</p>}
            <div style={{ marginTop: 16 }}>
              <p style={{ fontWeight: 500 }}>审批备注：</p>
              <TextArea
                rows={3} value={approveRemark}
                onChange={(e) => setApproveRemark(e.target.value)}
                placeholder="填写审批意见（驳回时必填）"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ────── 详情弹窗 ────── */}
      <ResizableModal
        open={detailOpen}
        title="报销单详情"
        onCancel={() => setDetailOpen(false)}
        width="40vw"
        centered
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {detailRecord && (
          <div style={{ padding: '0 8px' }}>
            <ModalFieldRow>
              <ModalField label="报销单号" value={detailRecord.reimbursementNo || '-'} />
              <ModalField label="状态" value={statusTag(detailRecord.status || 'pending')} />
            </ModalFieldRow>
            <ModalFieldRow>
              <ModalField label="申请人" value={detailRecord.applicantName || '-'} />
              <ModalField label="费用类型" value={typeLabel(detailRecord.expenseType)} />
            </ModalFieldRow>
            <ModalFieldRow>
              <ModalField label="事由" value={detailRecord.title || '-'} />
            </ModalFieldRow>
            <ModalFieldRow>
              <ModalField label="金额" value={
                <span style={{ color: 'var(--color-danger)', fontSize: 18, fontWeight: 600 }}>¥{detailRecord.amount?.toFixed(2)}</span>
              } />
              <ModalField label="费用日期" value={detailRecord.expenseDate || '-'} />
            </ModalFieldRow>
            {detailRecord.description && (
              <ModalFieldRow>
                <ModalField label="详细说明" value={detailRecord.description} />
              </ModalFieldRow>
            )}
            {detailRecord.orderNo && (
              <ModalFieldRow>
                <ModalField label="关联订单" value={detailRecord.orderNo} />
                {detailRecord.supplierName && <ModalField label="供应商" value={detailRecord.supplierName} />}
              </ModalFieldRow>
            )}

            <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0 8px', paddingTop: 12 }}>
              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>收款信息</span>
            </div>
            <ModalFieldRow>
              <ModalField label="收款方式" value={PAYMENT_METHODS.find(m => m.value === detailRecord.paymentMethod)?.label || detailRecord.paymentMethod || '-'} />
              <ModalField label="收款户名" value={detailRecord.accountName || '-'} />
            </ModalFieldRow>
            <ModalFieldRow>
              <ModalField label="收款账号" value={detailRecord.paymentAccount || '-'} />
              {detailRecord.bankName && <ModalField label="开户银行" value={detailRecord.bankName} />}
            </ModalFieldRow>

            {detailRecord.approverName && (
              <>
                <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0 8px', paddingTop: 12 }}>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>审批信息</span>
                </div>
                <ModalFieldRow>
                  <ModalField label="审批人" value={detailRecord.approverName} />
                  <ModalField label="审批时间" value={detailRecord.approvalTime ? dayjs(detailRecord.approvalTime).format('YYYY-MM-DD HH:mm') : '-'} />
                </ModalFieldRow>
                {detailRecord.approvalRemark && (
                  <ModalFieldRow>
                    <ModalField label="审批备注" value={detailRecord.approvalRemark} />
                  </ModalFieldRow>
                )}
              </>
            )}

            {detailRecord.paymentTime && (
              <>
                <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0 8px', paddingTop: 12 }}>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>付款信息</span>
                </div>
                <ModalFieldRow>
                  <ModalField label="付款时间" value={dayjs(detailRecord.paymentTime).format('YYYY-MM-DD HH:mm')} />
                  <ModalField label="付款人" value={detailRecord.paymentBy || '-'} />
                </ModalFieldRow>
              </>
            )}

            <ModalFieldRow>
              <ModalField label="提交时间" value={detailRecord.createTime ? dayjs(detailRecord.createTime).format('YYYY-MM-DD HH:mm') : '-'} />
            </ModalFieldRow>
          </div>
        )}
      </ResizableModal>
    </Layout>
  );
};

export default ExpenseReimbursementPage;
