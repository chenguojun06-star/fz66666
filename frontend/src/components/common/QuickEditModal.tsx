import React from 'react';
import { Modal, Form, Input, Select } from 'antd';
import { UnifiedDatePicker, dayjs } from './UnifiedDatePicker';

interface QuickEditModalProps {
  visible: boolean;
  loading: boolean;
  initialValues?: {
    remarks?: string;
    remark?: string;
    expectedShipDate?: string | null;
    urgencyLevel?: string;
  };
  onSave: (values: { remarks: string; expectedShipDate: string | null; urgencyLevel: string }) => Promise<void>;
  onCancel: () => void;
  title?: string;
}

/**
 * 通用快速编辑弹窗组件
 * 用于编辑备注和预计出货日期
 */
const QuickEditModal: React.FC<QuickEditModalProps> = ({
  visible,
  loading,
  initialValues,
  onSave,
  onCancel,
  title = '编辑备注和预计出货',
}) => {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (visible && initialValues) {
      form.setFieldsValue({
        remarks: initialValues.remarks || initialValues.remark || '',
        expectedShipDate: initialValues.expectedShipDate ? dayjs(initialValues.expectedShipDate) : null,
        urgencyLevel: initialValues.urgencyLevel || 'normal',
      });
    }
  }, [visible, initialValues, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSave({
        remarks: values.remarks?.trim() || '',
        expectedShipDate: values.expectedShipDate ? dayjs(values.expectedShipDate).format('YYYY-MM-DD') : null,
        urgencyLevel: values.urgencyLevel || 'normal',
      });
      form.resetFields();
    } catch (error) {
      // 表单验证失败，不执行任何操作
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={title}
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={500}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label="紧急程度"
          name="urgencyLevel"
        >
          <Select
            options={[
              { label: '普通', value: 'normal' },
              { label: '🔴 急单', value: 'urgent' },
            ]}
            placeholder="请选择紧急程度"
          />
        </Form.Item>
        <Form.Item
          label="预计出货日期"
          name="expectedShipDate"
        >
          <UnifiedDatePicker />
        </Form.Item>
        <Form.Item
          label="备注"
          name="remarks"
          rules={[{ max: 500, message: '备注不能超过500字' }]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入备注"
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default QuickEditModal;
