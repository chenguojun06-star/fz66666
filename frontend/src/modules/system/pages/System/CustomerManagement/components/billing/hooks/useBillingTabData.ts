import { useState, useEffect, useCallback } from 'react';
import { message, Form } from 'antd';
import { useModal } from '@/hooks';
import tenantService from '@/services/tenantService';
import { confirmAction } from '@/utils/confirm';
import type { TenantInfo, PlanDefinition, BillingRecord } from '@/services/tenantService';
import { PLAN_LABELS } from '../helpers';

export interface BillParams {
  page: number;
  pageSize: number;
  tenantId: number | undefined;
  status: string;
}

export const useBillingTabData = () => {
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
  const [billParams, setBillParams] = useState<BillParams>({ page: 1, pageSize: 20, tenantId: undefined, status: '' });

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

  useEffect(() => {
    if (!planModal.visible || !planModal.data) {
      planForm.resetFields();
      return;
    }
    const record = planModal.data;
    planForm.setFieldsValue({
      planType: record.planType || 'TRIAL',
      billingCycle: record.billingCycle || 'MONTHLY',
      monthlyFee: record.monthlyFee || 0,
      storageQuotaMb: record.storageQuotaMb || 1024,
      maxUsers: record.maxUsers || 50,
    });
  }, [planForm, planModal.data, planModal.visible]);

  const handleOpenPlanModal = (record: TenantInfo) => {
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
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e && Array.isArray((e as any).errorFields) && (e as any).errorFields.length) return;
      message.error(e instanceof Error ? e.message : '保存失败');
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
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载失败');
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
    confirmAction(`为「${record.tenantName}」生成${isYearly ? '年度' : '本月'}账单`, `将根据当前套餐配置（${PLAN_LABELS[record.planType]?.label ?? '未知'}，${feeLabel}，${isYearly ? '年付' : '月付'}）生成账单。`, async () => {
      try {
        await tenantService.generateMonthlyBill(record.id);
        message.success('账单已生成');
        fetchBills();
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '生成失败');
      }
    }, { okText: '确认生成' });
  };

  const handleMarkBillPaid = async (bill: BillingRecord) => {
    confirmAction(`确认标记账单 ${bill.billingNo} 已支付`, `金额：¥${bill.totalAmount}，租户：${bill.tenantName}`, async () => {
      try {
        await tenantService.markBillPaid(bill.id);
        message.success('已标记为已支付');
        fetchBills();
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '操作失败');
      }
    }, { okText: '确认支付' });
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
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
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
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setIssueInvoiceLoading(false);
    }
  };

  return {
    // 租户列表
    tenants,
    loading,
    plans,
    // 套餐弹窗
    planModal,
    planForm,
    planSaving,
    // 概览弹窗
    overviewModal,
    overview,
    overviewLoading,
    // 账单列表
    bills,
    billsTotal,
    billsLoading,
    billParams,
    setBillParams,
    // 减免弹窗
    pendingWaiveBill,
    setPendingWaiveBill,
    waiveBillLoading,
    handleWaiveConfirm,
    // 开票弹窗
    pendingIssueInvoiceBill,
    setPendingIssueInvoiceBill,
    invoiceNoValue,
    setInvoiceNoValue,
    issueInvoiceLoading,
    handleIssueInvoiceConfirm,
    // 事件处理
    handleOpenPlanModal,
    handlePlanTypeChange,
    handleBillingCycleChange,
    handleSavePlan,
    handleOpenOverview,
    handleGenerateBill,
    handleMarkBillPaid,
    handleWaiveBill,
    handleIssueInvoice,
    // 刷新
    fetchBills,
  };
};
