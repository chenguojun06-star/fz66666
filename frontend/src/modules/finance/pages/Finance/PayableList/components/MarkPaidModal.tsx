import React, { useCallback, useEffect, useState } from 'react';
import { Descriptions, Form, InputNumber, Typography } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import type { Payable } from '@/services/finance/payableApi';
import payableApi from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import { toMoneyLocale } from '@/utils/format';
import { getRemaining } from '../helpers';

const { Text } = Typography;

/** 登记付款弹窗：显示应付单余额并录入本次付款金额 */
const MarkPaidModal: React.FC<{
  open: boolean;
  record: Payable | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, record, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const remaining = getRemaining(record);

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({ amount: remaining });
    }
  }, [open, record, form, remaining]);

  const handleClose = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleOk = async () => {
    const { amount } = await form.validateFields();
    if (!record?.id) return;
    setSaving(true);
    try {
      await payableApi.markPaid(record.id, amount);
      message.success('付款金额已登记');
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
      title="登记付款"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={saving}
    >
      {record && (
        <div style={{ marginTop: 16 }}>
          <Descriptions column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="供应商">{record.supplierName}</Descriptions.Item>
            <Descriptions.Item label="应付金额">¥ {toMoneyLocale(record.amount)}</Descriptions.Item>
            <Descriptions.Item label="已付金额">¥ {toMoneyLocale(record.paidAmount)}</Descriptions.Item>
            <Descriptions.Item label="待付余额"><Text type="warning">¥ {toMoneyLocale(remaining)}</Text></Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item
              name="amount"
              label="本次付款金额（元）"
              rules={[
                { required: true, message: '请输入付款金额' },
                { type: 'number', min: 0.01, message: '金额必须大于0' },
              ]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
          </Form>
        </div>
      )}
    </SmallModal>
  );
};

export default MarkPaidModal;
