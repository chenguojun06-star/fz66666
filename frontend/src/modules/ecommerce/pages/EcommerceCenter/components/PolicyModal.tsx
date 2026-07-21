import React, { useState, useCallback, useEffect } from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { DistributorPricePolicy, DistributorLevel } from '../useDistributor';
import { POLICY_TYPE_OPTIONS } from '../distributorHelpers';

export interface PolicyModalProps {
  open: boolean;
  record: DistributorPricePolicy | null;
  levels: DistributorLevel[];
  onClose: () => void;
  onOk: (policy: DistributorPricePolicy) => Promise<void>;
}

/** 价格政策编辑弹窗 */
const PolicyModal: React.FC<PolicyModalProps> = ({ open, record, levels, onClose, onOk }) => {
  const [form] = Form.useForm<DistributorPricePolicy>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) form.setFieldsValue(record ?? { policyType: 'FIXED', enabled: 1 });
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk({ ...record, ...val }); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑价格政策' : '新增价格政策'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="策略名称" name="policyName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如 黄金分销商供货价" />
        </Form.Item>
        <Form.Item label="策略类型" name="policyType" rules={[{ required: true }]}>
          <Select options={POLICY_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="适用等级（空=全部）" name="distributorLevel">
          <Select allowClear options={levels.map(l => ({ label: l.levelName, value: l.levelCode }))} />
        </Form.Item>
        <Form.Item label="适用SKU（空=全部）" name="skuCode">
          <Input placeholder="SKU编码" />
        </Form.Item>
        <Form.Item label="供货价" name="supplyPrice">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="最低零售价（限价）" name="minRetailPrice">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="阶梯价JSON（TIERED类型填写）" name="tierJson" tooltip='格式：[{"minQty":1,"maxQty":99,"price":50},{"minQty":100,"price":45}]'>
          <Input.TextArea rows={3} placeholder='[{"minQty":1,"maxQty":99,"price":50},{"minQty":100,"price":45}]' />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default PolicyModal;
