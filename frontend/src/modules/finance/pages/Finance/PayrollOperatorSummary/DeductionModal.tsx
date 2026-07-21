import React from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

export interface DeductionModalProps {
    visible: boolean;
    record: Record<string, unknown> | null;
    form: FormInstance;
    loading: boolean;
    onClose: () => void;
    onOk: () => void;
}

const DeductionModal: React.FC<DeductionModalProps> = ({ visible, record, form, loading, onClose, onOk }) => (
    <ResizableModal
        title={`添加扣款 — ${record?.operatorName || ''}`}
        open={visible}
        onCancel={onClose}
        onOk={onOk}
        confirmLoading={loading}
        width="40vw"
    >
        <Form form={form} layout="vertical">
            <Form.Item name="type" label="扣款类型" rules={[{ required: true, message: '请选择扣款类型' }]}>
                <Select placeholder="请选择扣款类型" options={[
                    { value: 'ADVANCE_DEDUCTION', label: '借支抵扣' },
                    { value: 'QUALITY_PENALTY', label: '质量罚款' },
                    { value: 'ATTENDANCE_DEDUCTION', label: '考勤扣款' },
                    { value: 'OTHER', label: '其他' },
                ]} />
            </Form.Item>
            <Form.Item name="amount" label="扣款金额" rules={[{ required: true, message: '请输入扣款金额' }]}>
                <InputNumber
                    style={{ width: '100%' }}
                    min={0.01}
                    precision={2}
                    prefix="¥"
                    placeholder="请输入扣款金额"
                />
            </Form.Item>
            <Form.Item name="description" label="扣款说明">
                <Input.TextArea rows={3} placeholder="请输入扣款说明" maxLength={200} showCount />
            </Form.Item>
        </Form>
    </ResizableModal>
);

export default DeductionModal;
