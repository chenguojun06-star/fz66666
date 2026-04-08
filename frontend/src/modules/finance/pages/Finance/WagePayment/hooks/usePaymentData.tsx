import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Form, Modal } from 'antd';
import {
  wagePaymentApi,
  type WagePayment,
  type PaymentQueryRequest,
  type PayableItem,
} from '@/services/finance/wagePaymentApi';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

interface UsePaymentDataOptions {
  msg: { success: (text: string) => void; error: (text: string) => void; warning: (text: string) => void };
}

export function usePaymentData({ msg }: UsePaymentDataOptions) {
  // ---- Smart Error ----
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  }, [showSmartErrorNotice]);

  // ---- Tab ----
  const [activeTab, setActiveTab] = useState<string>('pending');

  // ---- 待收付款列表 ----
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [payablesLoading, setPayablesLoading] = useState(true);
  const [payableBizType, setPayableBizType] = useState<string>('');
  const [payableDateRange, setPayableDateRange] = useState<[string, string]>(['', '']);

  // ---- 批量选择 ----
  const [selectedPayableKeys, setSelectedPayableKeys] = useState<React.Key[]>([]);
  const [batchPaySubmitting, setBatchPaySubmitting] = useState(false);

  // ---- 驳回 ----
  const [pendingRejectPayable, setPendingRejectPayable] = useState<PayableItem | null>(null);
  const [rejectPayableLoading, setRejectPayableLoading] = useState(false);

  // ---- 收支记录列表 ----
  const [payments, setPayments] = useState<WagePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [filterForm] = Form.useForm();

  // ---- 数据加载 ----
  const fetchPayables = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const res: any = await wagePaymentApi.listPendingPayables(payableBizType || undefined);
      setPayables(res?.data ?? res ?? []);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('待收付款数据加载失败', errMsg, 'WAGE_PAYABLES_LOAD_FAILED');
      msg.error(`加载待收付款数据失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally {
      setPayablesLoading(false);
    }
  }, [payableBizType, msg, reportSmartError, showSmartErrorNotice]);

  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const values = filterForm.getFieldsValue();
      const query: PaymentQueryRequest = {};
      if (values.payeeName) query.payeeName = values.payeeName;
      if (values.status) query.status = values.status;
      if (values.paymentMethod) query.paymentMethod = values.paymentMethod;
      if (values.bizType) query.bizType = values.bizType;
      if (values.dateRange?.[0]) query.startTime = values.dateRange[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss');
      if (values.dateRange?.[1]) query.endTime = values.dateRange[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      const res: any = await wagePaymentApi.listPayments(query);
      setPayments(res?.data ?? res ?? []);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('收支记录加载失败', errMsg, 'WAGE_PAYMENTS_LOAD_FAILED');
      msg.error(`加载收支记录失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally {
      setPaymentsLoading(false);
    }
  }, [filterForm, msg, reportSmartError, showSmartErrorNotice]);

  useEffect(() => {
    if (activeTab === 'pending') fetchPayables();
    else fetchPayments();
  }, [activeTab, fetchPayables, fetchPayments]);

  // ---- 统计 ----
  const filteredPayables = useMemo(() => {
    if (!payableDateRange[0]) return payables;
    return payables.filter(p => {
      const ym = p.yearMonth ?? p.createTime?.substring(0, 7) ?? '';
      return ym === payableDateRange[0];
    });
  }, [payables, payableDateRange]);

  const pendingStats = useMemo(() => {
    const total = filteredPayables.length;
    const totalAmount = filteredPayables.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const reconCount = filteredPayables.filter(p => p.bizType === 'RECONCILIATION').length;
    const reimbCount = filteredPayables.filter(p => p.bizType === 'REIMBURSEMENT').length;
    const payrollCount = filteredPayables.filter(p => p.bizType === 'PAYROLL' || p.bizType === 'PAYROLL_SETTLEMENT').length;
    const orderCount = filteredPayables.filter(p => p.bizType === 'ORDER_SETTLEMENT').length;
    return { total, totalAmount, reconCount, reimbCount, payrollCount, orderCount };
  }, [filteredPayables]);

  const paymentStats = useMemo(() => {
    const total = payments.length;
    const successCount = payments.filter(p => p.status === 'success').length;
    const totalAmount = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const successAmount = payments.filter(p => p.status === 'success').reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return { total, successCount, totalAmount, successAmount };
  }, [payments]);

  // ---- 批量付款 ----
  const handleBatchPay = () => {
    const selected = filteredPayables.filter(p => selectedPayableKeys.includes(`${p.bizType}-${p.bizId}`));
    if (selected.length === 0) return;
    const totalAmt = selected.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    Modal.confirm({
      width: '30vw',
      title: '批量线下付款',
      content: (
        <div>
          <p>选中 <strong>{selected.length}</strong> 笔待收付款，合计金额：<strong style={{ color: '#cf1322' }}>¥{totalAmt.toFixed(2)}</strong></p>
          <p style={{ fontSize: 12, color: '#999' }}>将以「线下付款」方式逐笔发起，请在完成转账后分别上传凭证确认。</p>
        </div>
      ),
      okText: '确认批量发起',
      cancelText: '取消',
      onOk: async () => {
        setBatchPaySubmitting(true);
        let okCount = 0;
        let failCount = 0;
        for (const item of selected) {
          try {
            await wagePaymentApi.initiateWithCallback({
              payeeType: item.payeeType,
              payeeId: item.payeeId ?? '',
              payeeName: item.payeeName,
              paymentMethod: 'OFFLINE',
              amount: Number(item.amount) - Number(item.paidAmount || 0),
              bizType: item.bizType,
              bizId: item.bizId,
              bizNo: item.bizNo,
              remark: `批量付款 - ${item.description ?? ''}`,
            });
            okCount++;
          } catch {
            failCount++;
          }
        }
        setBatchPaySubmitting(false);
        setSelectedPayableKeys([]);
        if (failCount === 0) {
          msg.success(`批量发起成功：${okCount} 笔已进入支付流程`);
        } else {
          msg.warning(`批量发起完成：${okCount} 成功，${failCount} 失败`);
        }
        void fetchPayables();
        void fetchPayments();
      },
    });
  };

  // ---- 驳回待收付款 ----
  const handleRejectPayable = (record: PayableItem) => {
    setPendingRejectPayable(record);
  };

  const handleRejectPayableConfirm = async (reason: string) => {
    if (!pendingRejectPayable) return;
    setRejectPayableLoading(true);
    try {
      await wagePaymentApi.rejectPayable({
        bizType: pendingRejectPayable.bizType,
        bizId: pendingRejectPayable.bizId,
        reason: reason.trim(),
      });
      msg.success('已驳回');
      setPendingRejectPayable(null);
      fetchPayables();
    } catch (err: unknown) {
      msg.error(err instanceof Error ? err.message : '驳回失败');
    } finally {
      setRejectPayableLoading(false);
    }
  };

  // ---- 取消支付 ----
  const handleCancel = (record: WagePayment) => {
    Modal.confirm({
      width: '30vw',
      title: '确认取消',
      content: `确定取消支付单 ${record.paymentNo} 吗？`,
      onOk: async () => {
        try {
          await wagePaymentApi.cancelPayment(record.id, '手动取消');
          msg.success('已取消');
          fetchPayments();
        } catch (err: unknown) {
          msg.error(`取消支付失败: ${err instanceof Error ? err.message : '未知错误'}`);
        }
      },
    });
  };

  return {
    smartError, setSmartError, showSmartErrorNotice, reportSmartError,
    activeTab, setActiveTab,
    payables, payablesLoading, payableBizType, setPayableBizType,
    payableDateRange, setPayableDateRange,
    selectedPayableKeys, setSelectedPayableKeys, batchPaySubmitting, handleBatchPay,
    pendingRejectPayable, setPendingRejectPayable, rejectPayableLoading, handleRejectPayable, handleRejectPayableConfirm,
    payments, paymentsLoading, filterForm,
    fetchPayables, fetchPayments,
    filteredPayables, pendingStats, paymentStats,
    handleCancel,
  };
}
