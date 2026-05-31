import React from 'react';
import { Modal, List, Button } from 'antd';
import type { CartPreview } from '@/types/purchaseCart';

interface CartPreviewModalProps {
  visible: boolean;
  data: CartPreview | null;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

export const CartPreviewModal: React.FC<CartPreviewModalProps> = ({
  visible,
  data,
  onClose,
  onConfirm,
  submitting,
}) => {
  if (!data) return null;

  return (
    <Modal
      title="采购预览"
      open={visible}
      onCancel={onClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="confirm" type="primary" onClick={onConfirm} loading={submitting}>
          确认下单
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        将生成 <strong>{data.summary.totalGroups}</strong> 张采购单，
        共 <strong>{data.summary.totalItems}</strong> 件物料，
        合计 <strong>¥{data.summary.totalAmount?.toFixed(2)}</strong>
      </div>
      
      <List
        dataSource={data.purchaseGroups}
        renderItem={(group) => (
          <List.Item>
            <div style={{ width: '100%' }}>
              <div style={{ fontWeight: 600 }}>
                {group.materialName} ({group.materialCode})
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {group.supplierName} | {group.totalQuantity} | ¥{group.totalAmount?.toFixed(2)}
              </div>
              {group.sourceItems.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  来源：{group.sourceItems.map(s => `${s.sourceNo}(${s.quantity})`).join(' + ')}
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
    </Modal>
  );
};
