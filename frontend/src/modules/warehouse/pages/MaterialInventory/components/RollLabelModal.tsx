import React from 'react';
import {
  Button,
  Form,
  Select,
  InputNumber,
} from 'antd';
import SmallModal from '@/components/common/SmallModal';

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
            <Form.Item
              name="rollCount"
              label="共几卷/箱（张标签数）"
              rules={[{ required: true, message: '请填写卷数' }]}
            >
              <InputNumber min={1} max={200} style={{ width: '100%' }} placeholder="例如：5" />
            </Form.Item>
            <Form.Item
              name="quantityPerRoll"
              label="每卷/箱数量"
              rules={[{ required: true, message: '请填写每卷数量' }]}
            >
              <InputNumber min={0.01} style={{ width: '100%' }} placeholder="例如：30" />
            </Form.Item>
            <Form.Item name="unit" label="单位" initialValue="件">
              <Select>
                <Select.Option value="件">件</Select.Option>
                <Select.Option value="米">米</Select.Option>
                <Select.Option value="kg">kg</Select.Option>
                <Select.Option value="码">码</Select.Option>
                <Select.Option value="卷">卷</Select.Option>
                <Select.Option value="箱">箱</Select.Option>
              </Select>
            </Form.Item>
          </Form>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            生成后会弹出打印窗口，每张标签含二维码。仓管扫码（MR开头）即可确认发料。
          </p>
        </div>
      )}
    </SmallModal>
  );
};

export default RollLabelModal;
