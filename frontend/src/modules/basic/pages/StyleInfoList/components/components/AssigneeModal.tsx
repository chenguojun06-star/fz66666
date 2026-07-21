import React from 'react';
import { Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { SubProcessRow } from '../SampleProcessList.helpers';

// 指派人员弹窗（从 SampleProcessList.tsx 拆分而来）

export interface AssigneeModalProps {
  open: boolean;
  assigningRow: SubProcessRow | null;
  loading: boolean;
  form: FormInstance;
  onCancel: () => void;
  onOk: () => void;
}

const AssigneeModal: React.FC<AssigneeModalProps> = ({ open, assigningRow, loading, form, onCancel, onOk }) => {
  return (
    <Modal
      title={`指派 — ${assigningRow?.name || ''}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={loading}
      okText="确认指派"
      cancelText="取消"
    >
      <Form form={form} layout="vertical">
        <Form.Item name="assignee" label="指派人员" rules={[{ required: true, message: '请输入指派人员' }]}>
          <Input placeholder="输入人员姓名" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AssigneeModal;
