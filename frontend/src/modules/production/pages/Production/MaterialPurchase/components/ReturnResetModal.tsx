import React from 'react';
import { Form, Input } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { FormInstance } from 'antd';

interface ReturnResetModalProps {
  open: boolean;
  isMobile: boolean;
  returnResetForm: FormInstance;
  returnResetSubmitting: boolean;
  submitReturnReset: () => void;
  onCancel: () => void;
}

const ReturnResetModal: React.FC<ReturnResetModalProps> = ({
  open, isMobile, returnResetForm, returnResetSubmitting, submitReturnReset, onCancel,
}) => {
  return (
    <ResizableModal
      open={open}
      title="退回回料确认"
      okText="确认退回"
      cancelText="取消"
      okButtonProps={{ danger: true, type: 'default', loading: returnResetSubmitting }}
      width={isMobile ? '96vw' : '40vw'}
      onCancel={onCancel}
      onOk={submitReturnReset}
      destroyOnHidden
      autoFontSize={false}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
      scaleWithViewport
    >
      <Form form={returnResetForm} layout="vertical" preserve={false}>
        <Form.Item
          name="reason"
          label="退回原因"
          rules={[{ required: true, message: '请输入退回原因' }]}
        >
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default ReturnResetModal;
