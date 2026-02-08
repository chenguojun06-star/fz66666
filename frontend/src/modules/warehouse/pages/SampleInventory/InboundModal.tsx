import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, message, InputRef } from 'antd';
import { SampleTypeMap } from './types';
import api from '@/utils/api';

interface InboundModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const { Option } = Select;

const InboundModal: React.FC<InboundModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  // Refs for focus management (better for scanner)
  const styleNoRef = useRef<InputRef>(null);
  const colorRef = useRef<InputRef>(null);
  const sizeRef = useRef<InputRef>(null);

  useEffect(() => {
    if (visible) {
      form.resetFields();
      // Auto focus on styleNo when modal opens
      setTimeout(() => styleNoRef.current?.focus(), 100);
    }
  }, [visible, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const res = await api.post('/stock/sample/inbound', values);
      if (res.code === 200) {
        message.success('入库成功');
        onSuccess();
      } else {
        message.error(res.message || '入库失败');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="样衣入库 (支持扫码)"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="styleNo"
          label="款号"
          rules={[{ required: true, message: '请输入款号' }]}
          help="光标在此处时，使用扫码枪可直接录入"
        >
          <Input
            ref={styleNoRef}
            placeholder="请输入款号 / 扫码"
            onPressEnter={(e) => {
              e.preventDefault();
              colorRef.current?.focus();
            }}
          />
        </Form.Item>
        <Form.Item
          name="styleName"
          label="款式名称"
        >
          <Input placeholder="请输入款式名称" />
        </Form.Item>
        <Form.Item
          name="sampleType"
          label="样衣类型"
          rules={[{ required: true, message: '请选择样衣类型' }]}
          initialValue="development"
        >
          <Select>
            {Object.entries(SampleTypeMap).map(([key, label]) => (
              <Option key={key} value={key}>{label}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          name="color"
          label="颜色"
          rules={[{ required: true, message: '请输入颜色' }]}
        >
          <Input
            ref={colorRef}
            placeholder="请输入颜色"
            onPressEnter={(e) => {
              e.preventDefault();
              sizeRef.current?.focus();
            }}
          />
        </Form.Item>
        <Form.Item
          name="size"
          label="尺码"
          rules={[{ required: true, message: '请输入尺码' }]}
        >
          <Input
            ref={sizeRef}
            placeholder="请输入尺码"
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="入库数量"
          rules={[{ required: true, message: '请输入数量' }]}
          initialValue={1}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="location"
          label="存放位置"
        >
          <Input placeholder="例如: A-01-02" />
        </Form.Item>
        <Form.Item
          name="remark"
          label="备注"
        >
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default InboundModal;
