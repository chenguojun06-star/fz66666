import React, { useState, useCallback } from 'react';
import { Form, InputNumber } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { UniversalStock } from '../useEcStock';

export interface SafeStockModalProps {
  open: boolean;
  record: UniversalStock | null;
  onClose: () => void;
  onOk: (skuId: number, val: number) => void;
}

const SafeStockModal: React.FC<SafeStockModalProps> = ({ open, record, onClose, onOk }) => {
  const [form] = Form.useForm<{ safeStock: number }>();
  const [submitting, setSubmitting] = useState(false);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    if (!record) return;
    setSubmitting(true);
    try { await onOk(record.skuId, val.safeStock); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title="设置安全库存" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="30vw">
      <Form form={form} layout="vertical" initialValues={{ safeStock: record?.safeStock ?? 0 }}>
        <Form.Item label="安全库存" name="safeStock" rules={[{ required: true, message: '请输入安全库存' }]}>
          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default SafeStockModal;
