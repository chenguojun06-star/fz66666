import React from 'react';
import { Modal, Form, Radio, InputNumber, Input } from 'antd';
import type { FormInstance } from 'antd';
import type { ShippableInfo } from '@/services/production/factoryShipmentApi';

interface FactoryShipModalProps {
  open: boolean;
  orderNo?: string;
  shippableInfo: ShippableInfo | null;
  form: FormInstance;
  loading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

const FactoryShipModal: React.FC<FactoryShipModalProps> = ({
  open,
  orderNo,
  shippableInfo,
  form,
  loading,
  onSubmit,
  onCancel,
}) => (
  <Modal
    title={`发货 - ${orderNo || ''}`}
    open={open}
    onOk={onSubmit}
    onCancel={onCancel}
    confirmLoading={loading}
    destroyOnClose
  >
    <Form form={form} layout="vertical" initialValues={{ shipMethod: 'EXPRESS' }}>
      {shippableInfo && (
        <div style={{ marginBottom: 16, color: '#666' }}>
          裁片总数: {shippableInfo.cuttingTotal} | 已发: {shippableInfo.shippedTotal} | 剩余可发: {shippableInfo.remaining}
        </div>
      )}
      <Form.Item name="shipMethod" label="发货方式" rules={[{ required: true, message: '请选择发货方式' }]}>
        <Radio.Group>
          <Radio value="SELF_DELIVERY">自发货</Radio>
          <Radio value="EXPRESS">快递</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="shipQuantity" label="发货数量" rules={[{ required: true, message: '请输入发货数量' }]}>
        <InputNumber min={1} max={shippableInfo?.remaining} style={{ width: '100%' }} placeholder="请输入发货数量" />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.shipMethod !== cur.shipMethod}>
        {({ getFieldValue }) => getFieldValue('shipMethod') === 'EXPRESS' ? (
          <>
            <Form.Item name="trackingNo" label="快递单号">
              <Input placeholder="选填" />
            </Form.Item>
            <Form.Item name="expressCompany" label="快递公司">
              <Input placeholder="选填" />
            </Form.Item>
          </>
        ) : null}
      </Form.Item>
      <Form.Item name="remark" label="备注">
        <Input.TextArea rows={2} placeholder="选填" />
      </Form.Item>
    </Form>
  </Modal>
);

export default FactoryShipModal;
