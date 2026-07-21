import React from 'react';
import { Form, InputNumber } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

interface ArrivalFormModalProps {
  open: boolean;
  target: MaterialPurchaseType | null;
  loading: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onSubmit: (values: { arrivedQuantity: number }) => void;
  onCancel: () => void;
}

// 到货入库弹窗
const ArrivalFormModal: React.FC<ArrivalFormModalProps> = ({
  open,
  target,
  loading,
  form,
  onSubmit,
  onCancel,
}) => {
  return (
    <SmallModal
      open={open}
      title={`${target?.materialName || target?.materialCode || ''} — 到货入库`}
      okText="确认入库"
      confirmLoading={loading}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)', fontSize: 12 }}>
          采购 {target?.purchaseQuantity || '-'}{target?.unit ? ' ' + target.unit : ''}，
          已到 {target?.arrivedQuantity || 0}，
          待到 {target ? Math.max(0.01, Number(target.purchaseQuantity || 0) - Number(target.arrivedQuantity || 0)) : 0}
        </p>
        <Form.Item name="arrivedQuantity" label="到货数量" rules={[{ required: true, message: '请输入到货数量' }]}>
          <InputNumber
            min={0.01}
            max={target ? Math.max(0.01, Number(target.purchaseQuantity || 0) - Number(target.arrivedQuantity || 0)) : 1}
            step={0.01}
            precision={2}
            style={{ width: '100%' }}
            placeholder="请输入到货数量（支持小数）"
            autoFocus
          />
        </Form.Item>
      </Form>
    </SmallModal>
  );
};

export default ArrivalFormModal;

