import React, { useState, useCallback, useEffect } from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { B2BOrder, DistributorProfile } from '../useDistributor';

export interface B2BOrderModalProps {
  open: boolean;
  profiles: DistributorProfile[];
  onClose: () => void;
  onOk: (order: B2BOrder) => Promise<void>;
}

/** B2B 订单创建弹窗 */
const B2BOrderModal: React.FC<B2BOrderModalProps> = ({ open, profiles, onClose, onOk }) => {
  const [form] = Form.useForm<B2BOrder>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk(val); onClose(); }
    finally { setSubmitting(false); }
  }, [form, onOk, onClose]);
  return (
    <ResizableModal title="创建B2B订单" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="分销商" name="distributorId" rules={[{ required: true, message: '请选择分销商' }]}>
          <Select showSearch optionFilterProp="label" options={profiles
            .filter(p => p.status === 'ACTIVE')
            .map(p => ({ label: `${p.distributorName}（${p.distributorNo}）`, value: p.id }))} />
        </Form.Item>
        <Form.Item label="SKU编码" name="skuCode" rules={[{ required: true, message: '请输入SKU编码' }]}>
          <Input placeholder="SKU编码" />
        </Form.Item>
        <Form.Item label="商品名称" name="productName"><Input /></Form.Item>
        <Form.Item label="数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="收货人" name="receiverName"><Input /></Form.Item>
        <Form.Item label="收货电话" name="receiverPhone"><Input /></Form.Item>
        <Form.Item label="收货地址" name="receiverAddress"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item label="备注" name="buyerRemark"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default B2BOrderModal;
