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
  // 汇总行可能因后端删除路径未重算而滞后（僵尸计数），按实际条目推导
  const items = cart?.items || [];
  const totalItems = items.length || cart?.totalItems || 0;
  const totalAmount = items.length > 0
    ? items.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0)
    : 0;

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
