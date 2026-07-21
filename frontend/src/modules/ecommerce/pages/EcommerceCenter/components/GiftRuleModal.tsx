import React, { useState, useEffect, useCallback } from 'react';
import { Form, InputNumber, Input, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { GiftRule } from '../useEcStock';
import { GIFT_TRIGGER_TYPE_OPTIONS, GIFT_TRIGGER_PLATFORM_OPTIONS } from '../helpers';

export interface GiftRuleModalProps {
  open: boolean;
  record: GiftRule | null;
  onClose: () => void;
  onOk: (rule: GiftRule) => Promise<void>;
}

const GiftRuleModal: React.FC<GiftRuleModalProps> = ({ open, record, onClose, onOk }) => {
  const [form] = Form.useForm<GiftRule>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      form.setFieldsValue(record ?? { triggerType: 'AMOUNT', giftQuantity: 1, enabled: 1 });
    }
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try {
      await onOk({ ...record, ...val });
      onClose();
    } finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑赠品规则' : '新增赠品规则'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="规则名称" name="ruleName" rules={[{ required: true, message: '请输入规则名称' }]}>
          <Input placeholder="如：满99送袜子" />
        </Form.Item>
        <Form.Item label="赠品SKU编码" name="giftSkuCode" rules={[{ required: true, message: '请输入赠品SKU编码' }]}>
          <Input placeholder="赠品SKU编码" />
        </Form.Item>
        <Form.Item label="赠品数量" name="giftQuantity" rules={[{ required: true, message: '请输入赠品数量' }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="触发类型" name="triggerType" rules={[{ required: true }]}>
          <Select options={GIFT_TRIGGER_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item shouldUpdate noStyle>
          {({ getFieldValue }) => {
            const type = getFieldValue('triggerType');
            if (type === 'AMOUNT' || type === 'QUANTITY') {
              return (
                <Form.Item label={type === 'AMOUNT' ? '触发金额（元）' : '触发数量（件）'} name="triggerValue" rules={[{ required: true, message: '请输入触发阈值' }]}>
                  <InputNumber min={0} precision={type === 'AMOUNT' ? 2 : 0} style={{ width: '100%' }} />
                </Form.Item>
              );
            }
            if (type === 'PLATFORM') {
              return (
                <Form.Item label="触发平台" name="triggerPlatform" rules={[{ required: true, message: '请选择平台' }]}>
                  <Select options={GIFT_TRIGGER_PLATFORM_OPTIONS} />
                </Form.Item>
              );
            }
            return null;
          }}
        </Form.Item>
        <Form.Item label="是否启用" name="enabled">
          <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default GiftRuleModal;
