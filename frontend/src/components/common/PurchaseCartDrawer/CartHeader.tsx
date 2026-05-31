import React from 'react';
import { Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { PurchaseCart } from '@/types/purchaseCart';

interface CartHeaderProps {
  cart?: PurchaseCart | null;
  onClear: () => void;
}

export const CartHeader: React.FC<CartHeaderProps> = ({ cart, onClear }) => {
  const itemCount = cart?.totalItems || 0;
  
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>采购购物车 {itemCount > 0 && `(${itemCount}件)`}</span>
      {itemCount > 0 && (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onClear}
          size="small"
        >
          清空
        </Button>
      )}
    </div>
  );
};
