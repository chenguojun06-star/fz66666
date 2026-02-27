import React, { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, message } from 'antd';
import { SampleStock } from './types';
import api from '@/utils/api';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

interface LoanModalProps {
  visible: boolean;
  stock?: SampleStock;
  onCancel: () => void;
  onSuccess: () => void;
}

const LoanModal: React.FC<LoanModalProps> = ({ visible, stock, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [smartError, setSmartError] = React.useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '重试提交' });
  };

  useEffect(() => {
    if (visible && stock) {
      form.resetFields();
    }
  }, [visible, stock, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const payload = {
        sampleStockId: stock?.id,
        ...values,
        expectedReturnDate: values.expectedReturnDate ? values.expectedReturnDate.format('YYYY-MM-DD HH:mm:ss') : undefined
      };

      const res = await api.post('/stock/sample/loan', payload);
      if (res.code === 200) {
        message.success('借出成功');
        if (showSmartErrorNotice) setSmartError(null);
        onSuccess();
      } else {
        reportSmartError('样衣借出失败', res.message || '请检查输入后重试', 'SAMPLE_LOAN_SUBMIT_FAILED');
        message.error(res.message || '借出失败');
      }
    } catch (error) {
      console.error(error);
      reportSmartError('样衣借出失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'SAMPLE_LOAN_SUBMIT_EXCEPTION');
    } finally {
      setLoading(false);
    }
  };

  const available = stock ? (stock.quantity - stock.loanedQuantity) : 0;

  return (
    <Modal
      title={`借出样衣 - ${stock?.styleNo} (${stock?.color}/${stock?.size})`}
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
    >
      {showSmartErrorNotice && smartError ? (
        <div style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void handleOk();
            }}
          />
        </div>
      ) : null}

      <Form form={form} layout="vertical">
        <Form.Item
          name="borrower"
          label="借用人"
          rules={[{ required: true, message: '请输入借用人' }]}
        >
          <Input placeholder="请输入借用人姓名" />
        </Form.Item>
        <Form.Item
          name="quantity"
          label={`借出数量 (可用: ${available})`}
          rules={[{ required: true, message: '请输入数量' }]}
          initialValue={1}
        >
          <InputNumber min={1} max={available} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="expectedReturnDate"
          label="预计归还时间"
          initialValue={dayjs().add(7, 'day')}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="remark"
          label="借出原因/备注"
        >
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default LoanModal;
