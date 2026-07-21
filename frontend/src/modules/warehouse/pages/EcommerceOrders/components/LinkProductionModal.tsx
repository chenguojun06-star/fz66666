import React from 'react';
import { Form, Input, Alert } from 'antd';
import { LinkOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { EcOrder } from '../types';

interface Props {
  open: boolean;
  target: EcOrder | null;
  linking: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onOk: () => void;
  onCancel: () => void;
}

const LinkProductionModal: React.FC<Props> = ({ open, target, linking, form, onOk, onCancel }) => {
  return (
    <ResizableModal title={<><LinkOutlined /> 关联生产订单</>}
      open={open} onCancel={onCancel}
      onOk={onOk} confirmLoading={linking} okText="确认关联" width="85vw" maskClosable={false}>
      {target && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 14 }}>
          <div>平台订单: <b>{target.platformOrderNo}</b></div>
          <div>商品: {target.productName} × {target.quantity}</div>
          <div>实付: ¥{target.payAmount} &nbsp;|&nbsp; 买家: {target.buyerNick || target.receiverName}</div>
        </div>
      )}
      <Alert style={{ marginBottom: 12, fontSize: 14 }} type="info" showIcon
        title="关联后，该生产订单从仓库出库时将自动更新此电商订单为【已出库】并写入快递单号" />
      <Form form={form} layout="vertical">
        <Form.Item name="productionOrderNo" label="生产订单号"
          rules={[{ required: true, message: '请输入生产订单号' }]}>
          <Input placeholder="如 PO20260301001，可在工序跟进页查看" prefix={<SearchOutlined />} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default LinkProductionModal;
