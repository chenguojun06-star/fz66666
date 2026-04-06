import { useState, useEffect } from 'react';
import { Form } from 'antd';
import {
  wagePaymentApi,
  type PaymentAccount,
  type PayableItem,
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

  useEffect(() => {
    if (!payModalOpen) {
      payForm.resetFields();
      return;
    }

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
    setCurrentPayable(payable ?? null);

    if (payable) {
      loadPayeeAccounts(payable.payeeType, payable.payeeId);
    }
    setPayModalOpen(true);
  };

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
    } catch (err: any) {
      reportSmartError('支付发起失败', err?.message || '网络异常或服务不可用，请稍后重试', 'WAGE_PAY_SUBMIT_FAILED');
      if (err?.message) msg.error(err.message);
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
    openPayModal,
    handlePayeeChange,
    handleMethodSelect,
    handlePaySubmit,
  };
}
