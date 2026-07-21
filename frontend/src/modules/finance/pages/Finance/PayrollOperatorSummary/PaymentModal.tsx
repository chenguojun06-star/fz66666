import React from 'react';
import { Form, InputNumber } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';
import { toNumberOrZero } from './usePayrollData';

export interface PaymentModalProps {
    visible: boolean;
    record: Record<string, unknown> | null;
    form: FormInstance;
    loading: boolean;
    onClose: () => void;
    onOk: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ visible, record, form, loading, onClose, onOk }) => (
    <ResizableModal
        title={`记录打款 — ${record?.operatorName || ''}`}
        open={visible}
        onCancel={onClose}
        onOk={onOk}
        confirmLoading={loading}
        width="30vw"
    >
        <Form form={form} layout="vertical">
            <Form.Item label="剩余未付金额" style={{ color: 'var(--neutral-text-secondary)' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: 13 }}>
                    {formatMoney(Number(record?.remainingAmount ?? 0))}
                </span>
            </Form.Item>
            <Form.Item name="amount" label="打款金额" rules={[{ required: true, message: '请输入打款金额' }]}>
                <InputNumber
                    style={{ width: '100%' }}
                    min={0.01}
                    max={toNumberOrZero(record?.remainingAmount)}
                    precision={2}
                    prefix="¥"
                    placeholder="请输入打款金额"
                />
            </Form.Item>
        </Form>
    </ResizableModal>
);

export default PaymentModal;
