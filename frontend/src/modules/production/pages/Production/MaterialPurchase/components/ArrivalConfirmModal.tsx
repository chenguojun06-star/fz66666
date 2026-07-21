import React, { useState } from 'react';
import { App, Form, InputNumber, Descriptions } from 'antd';
import type { FormInstance } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialSpecWidth } from '@/utils/materialType';
import { formatMaterialQuantityWithUnit } from '../utils';
import api from '@/utils/api';

interface ArrivalConfirmModalProps {
  open: boolean;
  target: MaterialPurchaseType | null;
  form: FormInstance;
  onCancel: () => void;
  onSuccess?: () => void;
}

/**
 * 到货入库弹窗。
 * 业务逻辑保持与原 MaterialTable 中的 SmallModal + Form 一致。
 */
const ArrivalConfirmModal: React.FC<ArrivalConfirmModalProps> = ({ open, target, form, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  return (
    <SmallModal
      open={open}
      title={`${target?.materialName || target?.materialCode || ''} — 到货入库`}
      okText="确认入库"
      confirmLoading={loading}
      onOk={() => form.submit()}
      onCancel={() => { onCancel(); form.resetFields(); }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={async (values) => {
        if (!target) return;
        setLoading(true);
        try {
          await api.post('/production/material/inbound/confirm-arrival', { purchaseId: target.id, arrivedQuantity: values.arrivedQuantity });
          message.success('入库成功，库存已更新');
          onCancel();
          form.resetFields();
          onSuccess?.();
        } catch { message.error('入库失败'); }
        finally { setLoading(false); }
      }}>
        <Descriptions bordered column={3} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="物料类型">{target?.materialType ? <MaterialTypeTag value={target.materialType} /> : '-'}</Descriptions.Item>
          <Descriptions.Item label="物料名称">{target?.materialName || '-'}</Descriptions.Item>
          <Descriptions.Item label="物料编码">{target?.materialCode || '-'}</Descriptions.Item>
          <Descriptions.Item label="颜色">{target?.color || '-'}</Descriptions.Item>
          <Descriptions.Item label="规格/幅宽">{formatMaterialSpecWidth(target?.specifications, target?.fabricWidth)}</Descriptions.Item>
          <Descriptions.Item label="单位">{target?.unit || '-'}</Descriptions.Item>
          <Descriptions.Item label="采购数量">{formatMaterialQuantityWithUnit(target?.purchaseQuantity, target?.unit)}</Descriptions.Item>
          <Descriptions.Item label="已到货">{formatMaterialQuantityWithUnit(target?.arrivedQuantity || 0, target?.unit)}</Descriptions.Item>
          <Descriptions.Item label="待到货">{formatMaterialQuantityWithUnit(target ? Math.max(0, Number(target.purchaseQuantity || 0) - Number(target.arrivedQuantity || 0)) : 0, target?.unit)}</Descriptions.Item>
        </Descriptions>
        <Form.Item name="arrivedQuantity" label="本次到货数量" rules={[{ required: true, message: '请输入到货数量' }]}>
          <InputNumber
            min={0.01}
            max={target ? Math.max(0.01, Number(target.purchaseQuantity || 0) - Number(target.arrivedQuantity || 0)) : 1}
            step={0.01} precision={2}
            style={{ width: '100%' }}
            placeholder="请输入到货数量（支持小数）"
            autoFocus
          />
        </Form.Item>
      </Form>
    </SmallModal>
  );
};

export default ArrivalConfirmModal;
