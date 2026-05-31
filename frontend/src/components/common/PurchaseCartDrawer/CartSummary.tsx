import React from 'react';
import { Button } from 'antd';
import type { PurchaseCart } from '@/types/purchaseCart';

interface CartSummaryProps {
  cart?: PurchaseCart | null;
  selectedCount: number;
  onPreview: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

export const CartSummary: React.FC<CartSummaryProps> = ({
  cart,
  selectedCount,
  onPreview,
  onConfirm,
  submitting,
}) => {
  const totalItems = cart?.totalItems || 0;
  const totalAmount = cart?.totalAmount || 0;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-container)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          预计生成：<strong>{selectedCount}</strong> 件物料
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          合计：¥{totalAmount.toFixed(2)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={onPreview} disabled={totalItems === 0}>
          预览
        </Button>
        <Button
          type="primary"
          onClick={onConfirm}
          loading={submitting}
          disabled={selectedCount === 0}
        >
          确认下单
        </Button>
      </div>
    </div>
  );
};
