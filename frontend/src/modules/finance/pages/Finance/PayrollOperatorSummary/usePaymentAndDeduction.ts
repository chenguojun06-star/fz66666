import { useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { toNumberOrZero } from './usePayrollData';

export interface PaymentAndDeductionDeps {
    fetchData: () => void;
    message: ReturnType<typeof App.useApp>['message'];
}

/**
 * 打款 / 扣款弹窗的状态与提交逻辑。
 * - paymentForm / deductionForm 由本 hook 创建并返回，供弹窗组件消费
 * - 提交成功后调用 fetchData 刷新列表
 */
export function usePaymentAndDeduction({ fetchData, message }: PaymentAndDeductionDeps) {
    const [paymentModalVisible, setPaymentModalVisible] = useState(false);
    const [deductionModalVisible, setDeductionModalVisible] = useState(false);
    const [activeRecord, setActiveRecord] = useState<Record<string, unknown> | null>(null);
    const [paymentForm] = Form.useForm();
    const [deductionForm] = Form.useForm();
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [deductionLoading, setDeductionLoading] = useState(false);

    const handleRecordPayment = (record: Record<string, unknown>) => {
        setActiveRecord(record);
        paymentForm.resetFields();
        paymentForm.setFieldsValue({ amount: toNumberOrZero(record.remainingAmount) });
        setPaymentModalVisible(true);
    };

    const handleAddDeduction = (record: Record<string, unknown>) => {
        setActiveRecord(record);
        deductionForm.resetFields();
        setDeductionModalVisible(true);
    };

    const submitPayment = async () => {
        try {
            const values = await paymentForm.validateFields();
            if (!activeRecord?.id) { message.error('缺少结算记录ID'); return; }
            setPaymentLoading(true);
            await api.put(`/finance/payroll-settlement/${String(activeRecord.id)}/payment`, { amount: values.amount });
            message.success('打款记录已保存');
            setPaymentModalVisible(false);
            void fetchData();
        } catch (err: unknown) {
            if (err instanceof Error) message.error(err.message);
        } finally {
            setPaymentLoading(false);
        }
    };

    const submitDeduction = async () => {
        try {
            const values = await deductionForm.validateFields();
            if (!activeRecord?.id) { message.error('缺少结算记录ID'); return; }
            setDeductionLoading(true);
            await api.post(`/finance/payroll-settlement/${String(activeRecord.id)}/deduction`, {
                amount: values.amount,
                type: values.type,
                description: values.description,
            });
            message.success('扣款记录已保存');
            setDeductionModalVisible(false);
            void fetchData();
        } catch (err: unknown) {
            if (err instanceof Error) message.error(err.message);
        } finally {
            setDeductionLoading(false);
        }
    };

    return {
        paymentModalVisible, setPaymentModalVisible,
        deductionModalVisible, setDeductionModalVisible,
        activeRecord, setActiveRecord,
        paymentForm, deductionForm,
        paymentLoading, deductionLoading,
        handleRecordPayment, handleAddDeduction,
        submitPayment, submitDeduction,
    };
}
