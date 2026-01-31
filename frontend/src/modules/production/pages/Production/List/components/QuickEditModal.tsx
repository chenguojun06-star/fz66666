/**
 * QuickEditModal - 快速编辑弹窗
 * 功能：编辑备注和预计出货日期
 */
import React from 'react';
import { Form, Input, DatePicker } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductionOrder } from '@/types/production';
import dayjs from 'dayjs';

interface QuickEditModalProps {
  visible: boolean;
  order: ProductionOrder | null;
  onSave: (orderId: string | undefined, values: { remarks: string; expectedShipDate: string | null }) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

const QuickEditModal: React.FC<QuickEditModalProps> = ({
  visible,
  order,
  onSave,
  onCancel,
  saving = false,
}) => {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (visible && order) {
      form.setFieldsValue({
        remarks: order.remarks || '',
        expectedShipDate: order.expectedShipDate ? dayjs(order.expectedShipDate) : null,
      });
    }
  }, [visible, order, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSave(order?.id, {
        remarks: values.remarks || '',
        expectedShipDate: values.expectedShipDate ? values.expectedShipDate.format('YYYY-MM-DD') : null,
      });
      form.resetFields();
    } catch (error) {
      // 表单验证失败或保存失败
      console.error('Quick edit failed:', error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <ResizableModal
      title={`快速编辑 - ${order?.orderNo || ''}`}
      visible={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={saving}
      defaultWidth="40vw"
      defaultHeight="40vh"
      okText="保存"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          label="备注"
          name="remarks"
          rules={[{ max: 500, message: '备注不能超过500字' }]}
        >
          <Input.TextArea
            placeholder="请输入备注"
            autoSize={{ minRows: 4, maxRows: 8 }}
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item
          label="预计出货日期"
          name="expectedShipDate"
        >
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            placeholder="选择预计出货日期"
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default QuickEditModal;
