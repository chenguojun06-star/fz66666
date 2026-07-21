import React, { useCallback, useEffect, useState } from 'react';
import { Descriptions, Form, InputNumber, Input, Typography } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import { receivableApi, type Receivable } from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';
import { formatMoney } from '@/utils/format';

const { Text } = Typography;

const MarkReceivedModal: React.FC<{
  open: boolean;
  record: Receivable | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, record, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const remaining = record
    ? (Number(record.amount) - Number(record.receivedAmount ?? 0))
    : 0;

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({ amount: remaining, remark: '' });
    }
  }, [open, record, form, remaining]);

  const handleClose = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleOk = async () => {
    const { amount, remark } = await form.validateFields();
    if (!record?.id) return;
    setSaving(true);
    try {
      await receivableApi.markReceived(record.id, amount, remark);
      message.success('到账金额已登记');
      onSuccess();
      handleClose();
    } catch {
      message.error('登记失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SmallModal
      title="登记到账"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={saving}
    >
      {record && (
        <div style={{ marginTop: 16 }}>
          <Descriptions column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="客户">{record.customerName}</Descriptions.Item>
            <Descriptions.Item label="应收金额">{formatMoney(record.amount)}</Descriptions.Item>
            <Descriptions.Item label="已收金额">{formatMoney(record.receivedAmount)}</Descriptions.Item>
            <Descriptions.Item label="待收余款"><Text type="warning">{formatMoney(remaining)}</Text></Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item
              name="amount"
              label="本次到账金额（元）"
              rules={[
                { required: true, message: '请输入到账金额' },
                { type: 'number', min: 0.01, message: '金额必须大于0' },
              ]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item name="remark" label="到账备注">
              <Input.TextArea rows={3} placeholder="选填" />
            </Form.Item>
          </Form>
        </div>
      )}
    </SmallModal>
  );
};

export default MarkReceivedModal;
