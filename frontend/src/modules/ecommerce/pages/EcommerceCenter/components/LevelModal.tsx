import React, { useState, useCallback, useEffect } from 'react';
import { Form, Input, InputNumber } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { DistributorLevel } from '../useDistributor';

export interface LevelModalProps {
  open: boolean;
  record: DistributorLevel | null;
  onClose: () => void;
  onOk: (level: DistributorLevel) => Promise<void>;
}

/** 等级编辑弹窗 */
const LevelModal: React.FC<LevelModalProps> = ({ open, record, onClose, onOk }) => {
  const [form] = Form.useForm<DistributorLevel>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) form.setFieldsValue(record ?? { defaultDiscount: 100, sortOrder: 0, enabled: 1 });
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk({ ...record, ...val }); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑等级' : '新增等级'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="30vw">
      <Form form={form} layout="vertical">
        <Form.Item label="等级编码" name="levelCode" rules={[{ required: true, message: '请输入编码' }]}>
          <Input placeholder="如 VIP/A/B/C" disabled={!!record?.id} />
        </Form.Item>
        <Form.Item label="等级名称" name="levelName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如 黄金分销商" />
        </Form.Item>
        <Form.Item label="默认折扣率（0-100）" name="defaultDiscount">
          <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="升级门槛（累计采购额）" name="minPurchaseAmount">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="排序" name="sortOrder">
          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default LevelModal;
