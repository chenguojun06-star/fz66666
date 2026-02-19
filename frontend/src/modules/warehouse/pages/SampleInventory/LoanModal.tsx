import React, { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, message } from 'antd';
import { SampleStock } from './types';
import api from '@/utils/api';
import dayjs from 'dayjs';

interface LoanModalProps {
  visible: boolean;
  stock?: SampleStock;
  onCancel: () => void;
  onSuccess: () => void;
}

const LoanModal: React.FC<LoanModalProps> = ({ visible, stock, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

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
        onSuccess();
      } else {
        message.error(res.message || '借出失败');
      }
    } catch (error) {
      console.error(error);
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
