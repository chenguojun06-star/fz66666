import React from 'react';
import {
  Button,
  Form,
  Select,
  InputNumber,
  Alert,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';
import { message } from '@/utils/antdStatic';

import type { useMaterialInventoryData } from '../hooks/useMaterialInventoryData';

type InventoryData = ReturnType<typeof useMaterialInventoryData>;

export interface RollLabelModalProps {
  rollModal: InventoryData['rollModal'];
  rollForm: InventoryData['rollForm'];
  generatingRolls: InventoryData['generatingRolls'];
  handleGenerateRollLabels: InventoryData['handleGenerateRollLabels'];
}

const RollLabelModal: React.FC<RollLabelModalProps> = ({
  rollModal,
  rollForm,
  generatingRolls,
  handleGenerateRollLabels,
}) => {
  const rolls = Form.useWatch('rolls', rollForm) as { quantity?: number }[] | undefined;
  const unit = Form.useWatch('unit', rollForm) as string | undefined;

  const total = (rolls || []).reduce((sum, r) => sum + (Number(r?.quantity) || 0), 0);
  const expected = rollModal.data?.expectedQuantity;
  const mismatch = typeof expected === 'number' && expected > 0 && Math.abs(total - expected) > 0.001;

  /** 按「卷数 × 每卷数量」批量填充，填充后仍可逐行修改每卷真实米数 */
  const handleQuickFill = () => {
    const count = Number(rollForm.getFieldValue('rollCount')) || 0;
    const per = Number(rollForm.getFieldValue('quantityPerRoll')) || 0;
    if (count < 1 || per <= 0) {
      message.warning('请先填写卷数与每卷数量');
      return;
    }
    rollForm.setFieldValue('rolls', Array.from({ length: count }, () => ({ quantity: per })));
  };

  return (
    <SmallModal
      title="生成料卷/箱二维码标签"
      open={rollModal.visible}
      onCancel={rollModal.close}
      forceRender
      footer={[
        <Button key="cancel" onClick={rollModal.close}>取消</Button>,
        <Button
          key="ok"
          type="primary"
          loading={generatingRolls}
          onClick={handleGenerateRollLabels}
        >
          生成并打印
        </Button>,
      ]}
    >
      {rollModal.data && (
        <div style={{ padding: '8px 0' }}>
          <p style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            物料：<strong>{rollModal.data.materialName}</strong>（{rollModal.data.materialCode}）
          </p>
          <Form form={rollForm} layout="vertical">
            {/* 快捷填充：卷数 × 每卷数量，填充后逐行按实际米数修改 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
              <Form.Item name="rollCount" label="卷数" style={{ flex: 1, marginBottom: 0 }}>
                <InputNumber min={1} max={200} style={{ width: '100%' }} placeholder="例如：5" />
              </Form.Item>
              <Form.Item name="quantityPerRoll" label="每卷数量（快捷填充）" style={{ flex: 1, marginBottom: 0 }}>
                <InputNumber min={0.01} style={{ width: '100%' }} placeholder="例如：30" />
              </Form.Item>
              <Button onClick={handleQuickFill}>填充</Button>
            </div>

            {/* 逐卷明细：每卷一行，数量可各不相同 */}
            <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              <Form.List
                name="rolls"
                rules={[
                  {
                    validator: async (_, value) => {
                      if (!value || value.length === 0) {
                        throw new Error('请至少添加一卷');
                      }
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    {fields.map((field, index) => (
                      <div key={field.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ width: 64, flexShrink: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                          第 {index + 1} 卷
                        </span>
                        <Form.Item
                          {...field}
                          name={[field.name, 'quantity']}
                          rules={[{ required: true, message: '请填写该卷数量' }]}
                          style={{ flex: 1, marginBottom: 0 }}
                        >
                          <InputNumber min={0.01} style={{ width: '100%' }} placeholder="该卷真实数量（米）" />
                        </Form.Item>
                        <MinusCircleOutlined
                          onClick={() => remove(field.name)}
                          style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
                        />
                      </div>
                    ))}
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button type="dashed" onClick={() => add({ quantity: undefined })} block icon={<PlusOutlined />}>
                        添加一卷
                      </Button>
                    </Form.Item>
                    <Form.ErrorList errors={errors} />
                  </>
                )}
              </Form.List>
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                共 <strong>{(rolls || []).length}</strong> 卷，合计 <strong>{total}</strong> {unit || ''}
              </span>
              <Form.Item name="unit" label="单位" initialValue={rollModal.data?.unit || '米'} style={{ marginBottom: 0, minWidth: 120 }}>
                <Select style={{ width: 120 }}>
                  <Select.Option value="件">件</Select.Option>
                  <Select.Option value="米">米</Select.Option>
                  <Select.Option value="kg">kg</Select.Option>
                  <Select.Option value="码">码</Select.Option>
                  <Select.Option value="卷">卷</Select.Option>
                  <Select.Option value="箱">箱</Select.Option>
                </Select>
              </Form.Item>
            </div>

            {mismatch && (
              <Alert
                style={{ marginTop: 12 }}
                type="warning"
                showIcon
                message={`各卷合计 ${total} ${unit || ''}，与入库总量 ${expected} 不一致，请核对`}
              />
            )}

            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 12 }}>
              现实一批面料必然多卷且每卷米数不同，请按各卷实际数量逐行填写；生成后会弹出打印窗口，每张标签含二维码。仓管扫码（MR开头）即可按该卷数量确认发料。
            </p>
          </Form>
        </div>
      )}
    </SmallModal>
  );
};

export default RollLabelModal;