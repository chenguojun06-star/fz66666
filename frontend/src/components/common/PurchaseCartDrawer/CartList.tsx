import React from 'react';
import { Checkbox, Empty } from 'antd';
import { Spin } from 'antd';
import { CartItem } from './CartItem';
import type { PurchaseCartItem } from '@/types/purchaseCart';

interface CartListProps {
  items: PurchaseCartItem[];
  loading: boolean;
  selectedItems: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onSplit: (data: any) => void;
  submitting: boolean;
}

export const CartList: React.FC<CartListProps> = ({
  items,
  loading,
  selectedItems,
  onToggleSelect,
  onToggleSelectAll,
  onUpdate,
  onDelete,
  onSplit,
  submitting,
}) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Empty
        description="购物车是空的"
        style={{ margin: '40px 0' }}
      />
    );
  }

  const allSelected = items.length > 0 && selectedItems.size === items.length;

  const groupedItems = items.reduce((acc, item) => {
    const type = item.materialType || 'OTHER';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, PurchaseCartItem[]>);

  const typeLabels: Record<string, string> = {
    FABRIC: '面料类',
    LINING: '里料类',
    ACCESSORY: '辅料类',
    OTHER: '其他',
  };

  return (
    <div>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-container)' }}>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedItems.size > 0 && !allSelected}
          onChange={onToggleSelectAll}
        >
          全选 ({selectedItems.size}/{items.length})
        </Checkbox>
      </div>
      
      {Object.entries(groupedItems).map(([type, typeItems]) => (
        <div key={type}>
          <div style={{ padding: '8px 16px', fontWeight: 600, background: 'var(--color-bg-highlight)' }}>
            {typeLabels[type]} ({typeItems.length})
          </div>
          {typeItems.map(item => (
            <CartItem
              key={item.id}
              item={item}
              selected={selectedItems.has(item.id)}
              onToggleSelect={() => onToggleSelect(item.id)}
              onUpdate={(data) => onUpdate(item.id, data)}
              onDelete={() => onDelete(item.id)}
              onSplit={(qty) => onSplit({ itemId: item.id, splitQuantity: qty })}
              submitting={submitting}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
