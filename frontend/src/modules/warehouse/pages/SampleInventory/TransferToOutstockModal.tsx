import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Descriptions } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SampleStock } from './types';
import api from '@/utils/api';

interface TransferToOutstockModalProps {
  visible: boolean;
  record: SampleStock | null;
  onClose: () => void;
  onSuccess: () => void;
}

const TransferToOutstockModal: React.FC<TransferToOutstockModalProps> = ({
  visible,
  record,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const available = record ? record.quantity - record.loanedQuantity : 0;

  useEffect(() => {
    if (visible && record) {
      form.resetFields();
    }
  }, [visible, record, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const payload = {
        stockId: record?.id,
        quantity: values.quantity,
        customerName: values.customerName || undefined,
        customerPhone: values.customerPhone || undefined,
        shippingAddress: values.shippingAddress || undefined,
        expressCompany: values.expressCompany || undefined,
        trackingNo: values.trackingNo || undefined,
        remark: values.remark || undefined,
      };

      const res = await api.post('/stock/sample/transfer-to-outstock', payload);
      if (res.code === 200) {
        message.success('转成品出库成功');
        onSuccess();
      } else {
        message.error(res.message || '转成品出库失败');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in (error as Record<string, unknown>)) {
        return;
      }
      console.error(error);
      message.error((error as Error)?.message || '转成品出库失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResizableModal
      title="转成品出库"
      open={visible}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="确认出库"
      width="40vw"
      maskClosable={false}
      destroyOnHidden
    >
      <Descriptions
        column={2}
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ label: { color: 'var(--color-text-secondary)' } }}
      >
        <Descriptions.Item label="款号">{record?.styleNo || '-'}</Descriptions.Item>
        <Descriptions.Item label="款名">{record?.styleName || '-'}</Descriptions.Item>
        <Descriptions.Item label="颜色">{record?.color || '-'}</Descriptions.Item>
        <Descriptions.Item label="尺码">{record?.size || '-'}</Descriptions.Item>
        <Descriptions.Item label="当前库存">{record?.quantity ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="可用库存">{available}</Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical">
        <Form.Item
          name="quantity"
          label="出库数量"
          rules={[{ required: true, message: '请输入出库数量' }]}
          initialValue={1}
        >
          <InputNumber min={1} max={available} style={{ width: '100%' }} placeholder="请输入出库数量" />
        </Form.Item>
        <Form.Item name="customerName" label="客户名称">
          <Input placeholder="请输入客户名称" />
        </Form.Item>
        <Form.Item name="customerPhone" label="客户电话">
          <Input placeholder="请输入客户电话" />
        </Form.Item>
        <Form.Item name="shippingAddress" label="收货地址">
          <Input placeholder="请输入收货地址" />
        </Form.Item>
        <Form.Item name="expressCompany" label="快递公司">
          <Input placeholder="请输入快递公司" />
        </Form.Item>
        <Form.Item name="trackingNo" label="快递单号">
          <Input placeholder="请输入快递单号" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="请输入备注" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default TransferToOutstockModal;
