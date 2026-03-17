import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tag, Space, message, Form, Input, InputNumber, Modal, Select, Typography, Descriptions, Divider, Row, Col, Progress, Radio, Alert } from 'antd';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import tenantService from '@/services/tenantService';
import type { TenantInfo, PlanDefinition, BillingRecord } from '@/services/tenantService';
import type { ColumnsType } from 'antd/es/table';

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  TRIAL: { label: '免费试用', color: 'default' },
  BASIC: { label: '基础版', color: 'blue' },
  PRO: { label: '专业版', color: 'gold' },
  ENTERPRISE: { label: '企业版', color: 'purple' },
};

const BILL_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待支付', color: 'orange' },
  PAID: { label: '已支付', color: 'green' },
  OVERDUE: { label: '逾期', color: 'red' },
  WAIVED: { label: '已减免', color: 'default' },
};

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: '月付',
  YEARLY: '年付',
};

const formatStorageSize = (mb: number): string => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
};

// ========== 套餐与收费 Tab ==========
const BillingTab: React.FC = () => {
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const planModal = useModal<TenantInfo>();
  const overviewModal = useModal<TenantInfo>();
  const [planForm] = Form.useForm();
  const [planSaving, setPlanSaving] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // 账单列表
  const [bills, setBills] = useState<BillingRecord[]>([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billParams, setBillParams] = useState({ page: 1, pageSize: 20, tenantId: undefined as number | undefined, status: '' });

  // 减免弹窗状态
  const [pendingWaiveBill, setPendingWaiveBill] = useState<BillingRecord | null>(null);
  const [waiveBillLoading, setWaiveBillLoading] = useState(false);
  // 开票弹窗状态
  const [pendingIssueInvoiceBill, setPendingIssueInvoiceBill] = useState<BillingRecord | null>(null);
  const [invoiceNoValue, setInvoiceNoValue] = useState('');
  const [issueInvoiceLoading, setIssueInvoiceLoading] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantService.listTenants({ page: 1, pageSize: 200, status: 'active' });
      const d = res?.data || res;
      setTenants(d?.records || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchPlans = useCallback(async () => {
    try {
      const res: any = await tenantService.getPlanDefinitions();
      setPlans(res?.data || res || []);
    } catch { /* ignore */ }
  }, []);

  const fetchBills = useCallback(async () => {
    setBillsLoading(true);
    try {
      const params: any = { page: billParams.page, pageSize: billParams.pageSize };
      if (billParams.tenantId) params.tenantId = billParams.tenantId;
      if (billParams.status) params.status = billParams.status;
      const res: any = await tenantService.listBillingRecords(params);
      const d = res?.data || res;
      setBills(d?.records || []);
      setBillsTotal(d?.total || 0);
    } catch { /* ignore */ }
    finally { setBillsLoading(false); }
  }, [billParams]);

  useEffect(() => { fetchTenants(); fetchPlans(); }, [fetchTenants, fetchPlans]);
  useEffect(() => { fetchBills(); }, [fetchBills]);

  const handleOpenPlanModal = (record: TenantInfo) => {
    planForm.setFieldsValue({
      planType: record.planType || 'TRIAL',
      billingCycle: record.billingCycle || 'MONTHLY',
      monthlyFee: record.monthlyFee || 0,
      storageQuotaMb: record.storageQuotaMb || 1024,
      maxUsers: record.maxUsers || 50,
    });
    planModal.open(record);
  };

  const handlePlanTypeChange = (value: string) => {
    const plan = plans.find(p => p.code === value);
    if (plan) {
      planForm.setFieldsValue({
        monthlyFee: plan.monthlyFee,
        storageQuotaMb: plan.storageQuotaMb,
        maxUsers: plan.maxUsers,
      });
    }
  };

  const handleBillingCycleChange = () => {
    const currentPlan = planForm.getFieldValue('planType');
    const plan = plans.find(p => p.code === currentPlan);
    if (plan) {
      planForm.setFieldsValue({ monthlyFee: plan.monthlyFee });
    }
  };

  const handleSavePlan = async () => {
    const record = planModal.data;
    if (!record) return;
    try {
      const values = await planForm.validateFields();
      setPlanSaving(true);
      await tenantService.updateTenantPlan(record.id, values);
      message.success('套餐已更新');
      planModal.close();
      fetchTenants();
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '保存失败');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleOpenOverview = async (record: TenantInfo) => {
    overviewModal.open(record);
    setOverviewLoading(true);
    setOverview(null);
    try {
      const res: any = await tenantService.getTenantBillingOverview(record.id);
      setOverview(res?.data || res);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setOverviewLoading(false);
    }
  };

  const handleGenerateBill = async (record: TenantInfo) => {
    const isYearly = record.billingCycle === 'YEARLY';
    const plan = plans.find(p => p.code === record.planType);
    const feeLabel = isYearly
      ? `¥${plan?.yearlyFee || record.monthlyFee * 10}/年`
      : `¥${record.monthlyFee || 0}/月`;
    Modal.confirm({
      width: '30vw',
      title: `为「${record.tenantName}」生成${isYearly ? '年度' : '本月'}账单`,
      content: `将根据当前套餐配置（${PLAN_LABELS[record.planType]?.label || record.planType}，${feeLabel}，${isYearly ? '年付' : '月付'}）生成账单。`,
      okText: '确认生成',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.generateMonthlyBill(record.id);
          message.success('账单已生成');
          fetchBills();
        } catch (e: any) {
          message.error(e?.message || '生成失败');
        }
      },
    });
  };

  const handleMarkBillPaid = async (bill: BillingRecord) => {
    Modal.confirm({
      width: '30vw',
      title: `确认标记账单 ${bill.billingNo} 已支付`,
      content: `金额：¥${bill.totalAmount}，租户：${bill.tenantName}`,
      okText: '确认支付',
      onOk: async () => {
        try {
          await tenantService.markBillPaid(bill.id);
          message.success('已标记为已支付');
          fetchBills();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const handleWaiveBill = (bill: BillingRecord) => {
    setPendingWaiveBill(bill);
  };

  const handleWaiveConfirm = async (remark: string) => {
    if (!pendingWaiveBill) return;
    setWaiveBillLoading(true);
    try {
      await tenantService.waiveBill(pendingWaiveBill.id, remark);
      message.success('已减免');
      setPendingWaiveBill(null);
      fetchBills();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setWaiveBillLoading(false);
    }
  };

  const handleIssueInvoice = (bill: BillingRecord) => {
    setInvoiceNoValue('');
    setPendingIssueInvoiceBill(bill);
  };

  const handleIssueInvoiceConfirm = async () => {
    if (!pendingIssueInvoiceBill) return;
    if (!invoiceNoValue.trim()) { message.warning('请输入发票号码'); return; }
    setIssueInvoiceLoading(true);
    try {
      await tenantService.issueInvoice(pendingIssueInvoiceBill.id, invoiceNoValue.trim());
      message.success('已确认开票');
      setPendingIssueInvoiceBill(null);
      fetchBills();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setIssueInvoiceLoading(false);
    }
  };

  const tenantColumns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '租户编码', dataIndex: 'tenantCode', width: 100 },
    {
      title: '当前套餐', dataIndex: 'planType', width: 100, align: 'center',
      render: (v: string) => {
        const cfg = PLAN_LABELS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '月费', dataIndex: 'monthlyFee', width: 90, align: 'right',
      render: (v: number) => v > 0 ? `¥${v}` : <span style={{ color: '#999' }}>免费</span>,
    },
    {
      title: '计费', dataIndex: 'billingCycle', width: 70, align: 'center',
      render: (v: string) => {
        if (v === 'YEARLY') return <Tag color="blue">年付</Tag>;
        return <Tag>月付</Tag>;
      },
    },
    {
      title: '存储配额', width: 140,
      render: (_: unknown, r: TenantInfo) => {
        const used = r.storageUsedMb || 0;
        const quota = r.storageQuotaMb || 1024;
        const percent = quota > 0 ? Math.round(used * 100 / quota) : 0;
        return (
          <div style={{ minWidth: 100 }}>
            <Progress
              percent={percent}
              size="small"
              status={percent >= 90 ? 'exception' : 'normal'}
              format={() => `${formatStorageSize(used)}/${formatStorageSize(quota)}`}
              style={{ marginBottom: 0 }}
            />
          </div>
        );
      },
    },
    {
      title: '用户数', dataIndex: 'maxUsers', width: 80, align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: TenantInfo) => {
        const actions: RowAction[] = [
          { key: 'plan', label: '设置套餐', primary: true, onClick: () => handleOpenPlanModal(record) },
          { key: 'overview', label: '账单详情', onClick: () => handleOpenOverview(record) },
          { key: 'generate', label: '生成账单', onClick: () => handleGenerateBill(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  const billColumns: ColumnsType<BillingRecord> = [
    { title: '账单编号', dataIndex: 'billingNo', width: 150 },
    { title: '租户', dataIndex: 'tenantName', width: 130 },
    { title: '账期', dataIndex: 'billingMonth', width: 100, align: 'center' },
    {
      title: '套餐', dataIndex: 'planType', width: 90, align: 'center',
      render: (v: string) => PLAN_LABELS[v]?.label || v,
    },
    {
      title: '周期', dataIndex: 'billingCycle', width: 60, align: 'center',
      render: (v: string) => CYCLE_LABELS[v] || v || '月付',
    },
    { title: '基础费', dataIndex: 'baseFee', width: 90, align: 'right', render: (v: number) => `¥${v}` },
    { title: '合计', dataIndex: 'totalAmount', width: 90, align: 'right',
      render: (v: number) => <strong>¥{v}</strong>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (v: string) => {
        const cfg = BILL_STATUS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '支付时间', dataIndex: 'paidTime', width: 150 },
    {
      title: '发票', dataIndex: 'invoiceStatus', width: 80, align: 'center',
      render: (v: string) => {
        const map: Record<string, { label: string; color: string }> = {
          NOT_REQUIRED: { label: '无需', color: 'default' },
          PENDING: { label: '待开票', color: 'processing' },
          ISSUED: { label: '已开', color: 'success' },
          MAILED: { label: '已寄', color: 'success' },
        };
        const cfg = map[v] || { label: v || '—', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: BillingRecord) => {
        const actions: RowAction[] = [];
        if (record.status !== 'PAID' && record.status !== 'WAIVED') {
          actions.push({ key: 'pay', label: '标记已付', primary: true, onClick: () => handleMarkBillPaid(record) });
          actions.push({ key: 'waive', label: '减免', onClick: () => handleWaiveBill(record) });
        }
        if ((record as any).invoiceStatus === 'PENDING') {
          actions.push({ key: 'invoice', label: '确认开票', onClick: () => handleIssueInvoice(record) });
        }
        return actions.length > 0 ? <RowActions actions={actions} /> : '-';
      },
    },
  ];

  return (
    <div>
      {/* 租户套餐列表 */}
      <Typography.Title level={5} style={{ marginBottom: 12 }}>🏭 租户套餐一览</Typography.Title>
      <ResizableTable
        storageKey="customer-billing-tenants"
        rowKey="id"
        columns={tenantColumns}
        dataSource={tenants}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ y: 300 }}
      />

      <Divider />

      {/* 账单列表 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>📋 账单记录</Typography.Title>
        <Space>
          <Select
            placeholder="筛选租户"
            allowClear
            style={{ width: 160 }}
            onChange={(v) => setBillParams(p => ({ ...p, tenantId: v, page: 1 }))}
            options={tenants.map(t => ({ label: t.tenantName, value: t.id }))}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            onChange={(v) => setBillParams(p => ({ ...p, status: v || '', page: 1 }))}
            options={Object.entries(BILL_STATUS).map(([k, v]) => ({ label: v.label, value: k }))}
          />
        </Space>
      </div>
      <ResizableTable
        storageKey="customer-billing-records"
        rowKey="id"
        columns={billColumns}
        dataSource={bills}
        loading={billsLoading}
        pagination={{
          current: billParams.page, pageSize: billParams.pageSize, total: billsTotal,
          onChange: (p, ps) => setBillParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}
        size="small"
      />

      {/* 设置套餐弹窗 */}
      <ResizableModal
        open={planModal.visible}
        title={`设置套餐 - ${planModal.data?.tenantName || ''}`}
        onCancel={() => { planModal.close(); planForm.resetFields(); }}
        width="40vw"
        footer={
          <Space>
            <Button onClick={() => { planModal.close(); planForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={planSaving} onClick={handleSavePlan}>保存</Button>
          </Space>
        }
      >
        <Alert
          title="选择预设套餐会自动填充默认配置，也可手动调整各项参数。年付享8.3折优惠（买10个月送2个月）。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={planForm} layout="vertical">
          <Form.Item label="计费周期" name="billingCycle" rules={[{ required: true }]}>
            <Radio.Group onChange={handleBillingCycleChange}>
              <Radio.Button value="MONTHLY">月付</Radio.Button>
              <Radio.Button value="YEARLY">年付（8.3折）</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="套餐类型" name="planType" rules={[{ required: true }]}>
            <Select onChange={handlePlanTypeChange}>
              {plans.map(p => {
                const cycle = planForm.getFieldValue('billingCycle');
                const priceLabel = cycle === 'YEARLY'
                  ? `¥${p.yearlyFee}/年（省¥${p.monthlyFee * 12 - p.yearlyFee}）`
                  : `¥${p.monthlyFee}/月`;
                return (
                  <Select.Option key={p.code} value={p.code}>
                    {p.label}（{priceLabel}，{formatStorageSize(p.storageQuotaMb)}，{p.maxUsers}用户）
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="月费(元)" name="monthlyFee" rules={[{ required: true }]}>
                <InputNumber min={0} step={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="存储配额(MB)" name="storageQuotaMb" rules={[{ required: true }]}>
                <InputNumber min={100} step={1024} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="最大用户数" name="maxUsers" rules={[{ required: true }]}>
                <InputNumber min={1} max={9999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </ResizableModal>

      {/* 账单详情弹窗 */}
      <ResizableModal
        open={overviewModal.visible}
        title={`账单详情 - ${overviewModal.data?.tenantName || ''}`}
        onCancel={overviewModal.close}
        width="40vw"
        footer={<Button onClick={overviewModal.close}>关闭</Button>}
      >
        {overviewLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
        ) : overview ? (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="套餐类型">
                <Tag color={PLAN_LABELS[overview.planType]?.color || 'default'}>
                  {PLAN_LABELS[overview.planType]?.label || overview.planType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="计费周期">
                <Tag color={overview.billingCycle === 'YEARLY' ? 'blue' : 'default'}>
                  {CYCLE_LABELS[overview.billingCycle] || '月付'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="月费">¥{overview.monthlyFee || 0}</Descriptions.Item>
              <Descriptions.Item label="存储配额">
                {formatStorageSize(overview.storageQuotaMb || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="已用存储">
                <Progress
                  percent={overview.storageUsedPercent || 0}
                  size="small"
                  status={(overview.storageUsedPercent || 0) >= 90 ? 'exception' : 'normal'}
                  style={{ width: 150, display: 'inline-flex' }}
                />
                <span style={{ marginLeft: 8 }}>
                  {formatStorageSize(overview.storageUsedMb || 0)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="最大用户数">{overview.maxUsers}</Descriptions.Item>
              <Descriptions.Item label="当前用户数">{overview.currentUsers}</Descriptions.Item>
              <Descriptions.Item label="付费状态">
                <Tag color={overview.paidStatus === 'PAID' ? 'gold' : 'default'}>
                  {overview.paidStatus === 'PAID' ? '已付费' : '免费试用'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="到期时间">
                {overview.expireTime || '永不过期'}
              </Descriptions.Item>
            </Descriptions>

            {overview.recentBills?.length > 0 && (
              <>
                <Divider style={{ marginTop: 24 }}>最近账单</Divider>
                <ResizableTable
                  storageKey="customer-billing-overview-bills"
                  rowKey="id"
                  columns={[
                    { title: '账期', dataIndex: 'billingMonth', width: 90 },
                    { title: '金额', dataIndex: 'totalAmount', width: 80, render: (v: number) => `¥${v}` },
                    { title: '状态', dataIndex: 'status', width: 80,
                      render: (v: string) => <Tag color={BILL_STATUS[v]?.color || 'default'}>{BILL_STATUS[v]?.label || v}</Tag>,
                    },
                    { title: '支付时间', dataIndex: 'paidTime', width: 150 },
                  ]}
                  dataSource={overview.recentBills}
                  pagination={false}
                  size="small"
                />
              </>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
        )}
      </ResizableModal>

      {/* 开票弹窗 */}
      <Modal
        open={!!pendingIssueInvoiceBill}
        title={`确认开票 - ${pendingIssueInvoiceBill?.billingNo || ''}`}
        onOk={handleIssueInvoiceConfirm}
        onCancel={() => setPendingIssueInvoiceBill(null)}
        okText="确认开票"
        confirmLoading={issueInvoiceLoading}
        width="30vw"
        destroyOnHidden
      >
        <p>租户：{pendingIssueInvoiceBill?.tenantName}，金额：¥{pendingIssueInvoiceBill?.totalAmount}</p>
        <p>抬头：{(pendingIssueInvoiceBill as any)?.invoiceTitle || '—'}</p>
        <p>税号：{(pendingIssueInvoiceBill as any)?.invoiceTaxNo || '—'}</p>
        <Input
          placeholder="请输入发票号码"
          value={invoiceNoValue}
          onChange={(e) => setInvoiceNoValue(e.target.value)}
          style={{ marginTop: 8 }}
        />
      </Modal>

      {/* 减免原因弹窗 */}
      <RejectReasonModal
        open={pendingWaiveBill !== null}
        title={`减免账单 ${pendingWaiveBill?.billingNo || ''}`}
        fieldLabel="减免原因"
        required={false}
        okDanger={false}
        okText="确认减免"
        loading={waiveBillLoading}
        onOk={handleWaiveConfirm}
        onCancel={() => setPendingWaiveBill(null)}
      />
    </div>
  );
};

export default BillingTab;
