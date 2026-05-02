import { useState, useEffect, useRef, useCallback } from 'react';
import { Form } from 'antd';
import {
  wagePaymentApi,
  type PaymentAccount,
  type PayableItem,
  type PayeeSearchResult,
} from '@/services/finance/wagePaymentApi';

interface UsePayModalOptions {
  msg: { success: (text: string) => void; error: (text: string) => void };
  fetchPayables: () => void;
  fetchPayments: () => void;
  reportSmartError: (title: string, reason?: string, code?: string) => void;
}

export function usePayModal({ msg, fetchPayables, fetchPayments, reportSmartError }: UsePayModalOptions) {
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [payAccounts, setPayAccounts] = useState<PaymentAccount[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [currentPayable, setCurrentPayable] = useState<PayableItem | null>(null);
  const hasOpenedRef = useRef(false);

  const [payeeOptions, setPayeeOptions] = useState<PayeeSearchResult[]>([]);
  const [payeeSearching, setPayeeSearching] = useState(false);
  const payeeSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!payModalOpen) {
      if (hasOpenedRef.current) {
        payForm.resetFields();
      }
      return;
    }
    hasOpenedRef.current = true;

    if (!currentPayable) {
      return;
    }

    payForm.setFieldsValue({
      payeeType: currentPayable.payeeType,
      payeeId: currentPayable.payeeId,
      payeeName: currentPayable.payeeName,
      amount: Number(currentPayable.amount) - Number(currentPayable.paidAmount || 0),
      bizType: currentPayable.bizType,
      bizId: currentPayable.bizId,
      bizNo: currentPayable.bizNo,
    });
  }, [currentPayable, payForm, payModalOpen]);

  const loadPayeeAccounts = async (ownerType: string, ownerId: string) => {
    try {
      const res: any = await wagePaymentApi.listAccounts(ownerType, ownerId);
      setPayAccounts(res?.data ?? res ?? []);
    } catch {
      // ignore
    }
  };

  const openPayModal = (payable?: PayableItem) => {
    payForm.resetFields();
    setSelectedMethod('');
    setSelectedAccount(null);
    setPayAccounts([]);
    setPayeeOptions([]);
    setCurrentPayable(payable ?? null);

    if (payable) {
      loadPayeeAccounts(payable.payeeType, payable.payeeId);
    }
    setPayModalOpen(true);
  };

  const handlePayeeSearch = useCallback((keyword: string) => {
    if (payeeSearchTimerRef.current) {
      clearTimeout(payeeSearchTimerRef.current);
    }
    if (!keyword || keyword.trim().length < 1) {
      setPayeeOptions([]);
      return;
    }
    const payeeType = payForm.getFieldValue('payeeType');
    payeeSearchTimerRef.current = setTimeout(async () => {
      setPayeeSearching(true);
      try {
        const res: any = await wagePaymentApi.searchPayee(keyword.trim(), payeeType || undefined);
        setPayeeOptions(res?.data ?? res ?? []);
      } catch {
        setPayeeOptions([]);
      } finally {
        setPayeeSearching(false);
      }
    }, 300);
  }, [payForm]);

  const handlePayeeSelect = useCallback((value: string) => {
    const selected = payeeOptions.find(p => p.id === value);
    if (selected) {
      payForm.setFieldsValue({
        payeeId: selected.id,
        payeeType: selected.payeeType,
        payeeName: selected.name,
      });
      loadPayeeAccounts(selected.payeeType, selected.id);
    }
  }, [payeeOptions, payForm]);

  const handlePayeeTypeChange = useCallback(() => {
    payForm.setFieldsValue({ payeeId: undefined, payeeName: undefined });
    setPayeeOptions([]);
  }, [payForm]);

  const handlePayeeChange = () => {
    const payeeType = payForm.getFieldValue('payeeType');
    const payeeId = payForm.getFieldValue('payeeId');
    if (payeeType && payeeId) {
      loadPayeeAccounts(payeeType, payeeId);
    }
  };

  const handleMethodSelect = (method: string) => {
    setSelectedMethod(method);
    payForm.setFieldsValue({ paymentMethod: method });
    if (method !== 'OFFLINE') {
      const matchAccounts = payAccounts.filter(a => a.accountType === method);
      const defaultOne = matchAccounts.find(a => a.isDefault === 1) ?? matchAccounts[0];
      setSelectedAccount(defaultOne ?? null);
      payForm.setFieldsValue({ paymentAccountId: defaultOne?.id });
    } else {
      setSelectedAccount(null);
      payForm.setFieldsValue({ paymentAccountId: undefined });
    }
  };

  const handlePaySubmit = async () => {
    try {
      const values = await payForm.validateFields();
      setPaySubmitting(true);

      const hasBiz = values.bizType && values.bizId;
      const apiCall = hasBiz ? wagePaymentApi.initiateWithCallback : wagePaymentApi.initiatePayment;

      const res: any = await apiCall({
        payeeType: values.payeeType,
        payeeId: values.payeeId,
        payeeName: values.payeeName,
        paymentAccountId: values.paymentAccountId,
        paymentMethod: values.paymentMethod,
        amount: values.amount,
        bizType: values.bizType,
        bizId: values.bizId,
        bizNo: values.bizNo,
        remark: values.remark,
      });
      const payment = res?.data ?? res;
      if (payment) {
        msg.success(`支付已发起，单号：${payment.paymentNo}`);
        setPayModalOpen(false);
        fetchPayables();
        fetchPayments();
      }
    } catch (err: unknown) {
      reportSmartError('支付发起失败', err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试', 'WAGE_PAY_SUBMIT_FAILED');
      if (err instanceof Error) msg.error(err.message);
    } finally {
      setPaySubmitting(false);
    }
  };

  return {
    payModalOpen, setPayModalOpen,
    payForm,
    payAccounts,
    selectedMethod, selectedAccount,
    paySubmitting,
    currentPayable,
    payeeOptions,
    payeeSearching,
    openPayModal,
    handlePayeeChange,
    handlePayeeSearch,
    handlePayeeSelect,
    handlePayeeTypeChange,
    handleMethodSelect,
    handlePaySubmit,
  };
}
