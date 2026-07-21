import React, { useState, useCallback } from 'react';
import { Form, Input, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { MergeGroup } from '../useEcStock';
import { EXPRESS_COMPANY_OPTIONS } from '../helpers';

export interface MergeOutboundModalProps {
  open: boolean;
  group: MergeGroup | null;
  onClose: () => void;
  onOk: (orderIds: number[], trackingNo: string, expressCompany: string) => Promise<void>;
}

const MergeOutboundModal: React.FC<MergeOutboundModalProps> = ({ open, group, onClose, onOk }) => {
  const [form] = Form.useForm<{ trackingNo: string; expressCompany: string }>();
  const [submitting, setSubmitting] = useState(false);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    if (!group) return;
    setSubmitting(true);
    try {
      await onOk(group.orders.map(o => o.orderId), val.trackingNo, val.expressCompany);
      onClose();
    } finally { setSubmitting(false); }
  }, [form, group, onOk, onClose]);
  return (
    <ResizableModal title="合单发货" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      {group && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 8 }}>
            收货人：{group.receiverName} | {group.receiverPhone} | 平台：{group.platform}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 8 }}>
            共 {group.orderCount} 笔订单，{group.totalQuantity} 件商品
          </div>
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item label="快递单号" name="trackingNo" rules={[{ required: true, message: '请输入快递单号' }]}>
          <Input placeholder="请输入快递单号" />
        </Form.Item>
        <Form.Item label="快递公司" name="expressCompany" rules={[{ required: true, message: '请选择快递公司' }]}>
          <Select placeholder="请选择快递公司" options={EXPRESS_COMPANY_OPTIONS} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default MergeOutboundModal;
