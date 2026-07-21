import React, { useCallback, useState } from 'react';
import { Col, DatePicker, Form, Input, InputNumber, Row } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { receivableApi, type Receivable } from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';

const CreateReceivableModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleClose = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload: Receivable = {
        customerId: values.customerId ?? '',
        customerName: values.customerName,
        orderNo: values.orderNo,
        amount: values.amount,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
        description: values.description,
      };
      await receivableApi.create(payload);
      message.success('应收单创建成功');
      onSuccess();
      handleClose();
    } catch {
      message.error('创建失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title="新建应收单"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={saving}
      width="40vw"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="customerName" label="客户名称" rules={[{ required: true }]}>
              <Input placeholder="客户公司全称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="orderNo" label="关联订单号">
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="amount" label="应收金额（元）" rules={[{ required: true }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="dueDate" label="到期日期">
              <DatePicker style={{ width: '100%' }} placeholder="选择到期日期" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="备注">
          <Input.TextArea id="description" rows={3} placeholder="备注说明" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default CreateReceivableModal;
