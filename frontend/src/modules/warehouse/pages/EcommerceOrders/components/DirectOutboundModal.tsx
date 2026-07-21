import React from 'react';
import { Form, Input, Select, Alert } from 'antd';
import { CarOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { EXPRESS_COMPANIES } from '../helpers';
import type { EcOrder } from '../types';

interface Props {
  open: boolean;
  target: EcOrder | null;
  outbounding: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onOk: () => void;
  onCancel: () => void;
}

const DirectOutboundModal: React.FC<Props> = ({ open, target, outbounding, form, onOk, onCancel }) => {
  return (
    <ResizableModal title={<><CarOutlined /> 现货直接出库</>}
      open={open} onCancel={onCancel}
      onOk={onOk} confirmLoading={outbounding} okText="确认出库" width="85vw" maskClosable={false}>
      {target && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 14 }}>
          <div>平台订单: <b>{target.platformOrderNo || target.orderNo}</b></div>
          <div>商品: {target.productName} × {target.quantity}</div>
          <div>收件人: {target.receiverName} &nbsp;{target.receiverPhone}</div>
        </div>
      )}
      <Alert style={{ marginBottom: 12, fontSize: 14 }} type="success" showIcon
        title="出库后自动扣减SKU库存、更新订单状态为【已出库】、生成销售收入流水、回传物流信息到平台" />
      <Form form={form} layout="vertical">
        <Form.Item name="expressCompany" label="快递公司"
          rules={[{ required: true, message: '请输入快递公司' }]}>
          <Select placeholder="请选择快递公司" showSearch allowClear>
            {EXPRESS_COMPANIES.map(c => (
              <Select.Option key={c} value={c}>{c}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="trackingNo" label="快递单号"
          rules={[{ required: true, message: '请输入快递单号' }]}>
          <Input placeholder="输入快递单号" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default DirectOutboundModal;
