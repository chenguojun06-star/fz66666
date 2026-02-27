import React, { useEffect, useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, message, Row, Col } from 'antd';
import type { InputRef } from 'antd';
import { SampleTypeMap } from './types';
import api from '@/utils/api';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

interface InboundModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const { Option } = Select;

const InboundModal: React.FC<InboundModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [smartError, setSmartError] = React.useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '重试提交' });
  };

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
        if (showSmartErrorNotice) setSmartError(null);
        onSuccess();
      } else {
        reportSmartError('样衣入库失败', res.message || '请检查输入后重试', 'SAMPLE_INBOUND_SUBMIT_FAILED');
        message.error(res.message || '入库失败');
      }
    } catch (error) {
      console.error(error);
      reportSmartError('样衣入库失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'SAMPLE_INBOUND_SUBMIT_EXCEPTION');
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
      width="60vw"
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
        {/* 第一行：款号、款式名称、样衣类型 */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="styleNo"
              label="款号"
              rules={[{ required: true, message: '请输入款号' }]}
              help="扫码枪可直接录入"
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
          </Col>
          <Col span={8}>
            <Form.Item name="styleName" label="款式名称">
              <Input placeholder="请输入款式名称" />
            </Form.Item>
          </Col>
          <Col span={8}>
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
          </Col>
        </Row>

        {/* 第二行：颜色、尺码、入库数量 */}
        <Row gutter={16}>
          <Col span={8}>
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
          </Col>
          <Col span={8}>
            <Form.Item
              name="size"
              label="尺码"
              rules={[{ required: true, message: '请输入尺码' }]}
            >
              <Input ref={sizeRef} placeholder="请输入尺码" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="quantity"
              label="入库数量"
              rules={[{ required: true, message: '请输入数量' }]}
              initialValue={1}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {/* 第三行：存放位置、备注 */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="location" label="存放位置">
              <Input placeholder="例如: A-01-02" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default InboundModal;
