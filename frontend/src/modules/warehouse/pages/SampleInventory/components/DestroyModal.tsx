import React from 'react';
import { App, Form, Input, Modal } from 'antd';
import api from '@/utils/api';
import { SampleStock } from '../types';

interface DestroyModalProps {
  visible: boolean;
  stock: SampleStock | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const DestroyModal: React.FC<DestroyModalProps> = ({ visible, stock, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [destroyForm] = Form.useForm<{ remark: string }>();
  const [destroyLoading, setDestroyLoading] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      destroyForm.resetFields();
    }
  }, [destroyForm, visible]);

  const handleDestroy = async () => {
    if (!stock?.id) return;
    try {
      const values = await destroyForm.validateFields();
      setDestroyLoading(true);
      const res = await api.post('/stock/sample/destroy', {
        stockId: stock.id,
        remark: values.remark,
      });
      if (res.code === 200) {
        message.success('样衣库存已销毁');
        destroyForm.resetFields();
        onSuccess();
        return;
      }
      message.error(res.message || '销毁失败');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in (error as Record<string, unknown>)) {
        return;
      }
      console.error(error);
      message.error((error as Error)?.message || '销毁失败');
    } finally {
      setDestroyLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      title={`销毁样衣库存${stock?.styleNo ? ` - ${stock.styleNo}` : ''}`}
      onCancel={onCancel}
      onOk={() => void handleDestroy()}
      maskClosable={false}
      okText="确认销毁"
      okButtonProps={{ danger: true }}
      confirmLoading={destroyLoading}
      destroyOnHidden
    >
      <Form form={destroyForm} layout="vertical">
        <Form.Item label="库存编号">
          <Input id="destroyInventoryId" value={stock?.id || '-'} readOnly />
        </Form.Item>
        <Form.Item label="基础信息">
          <Input
            value={[
              stock?.styleNo || '-',
              stock?.styleName || '-',
              stock?.color || '-',
              stock?.size || '-',
            ].join(' / ')}
            readOnly
          />
        </Form.Item>
        <Form.Item
          name="remark"
          label="销毁备注"
          rules={[{ required: true, message: '请填写销毁备注后再提交' }]}
        >
          <Input.TextArea rows={4} maxLength={300} showCount placeholder="请填写销毁原因、处理说明、责任说明等" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DestroyModal;
