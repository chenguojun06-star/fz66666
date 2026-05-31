import React, { useState } from 'react';
import { Checkbox, InputNumber, Button, Popconfirm, App } from 'antd';
import { EditOutlined, SplitCellsOutlined, DeleteOutlined } from '@ant-design/icons';
import type { PurchaseCartItem, UpdateCartItemRequest } from '@/types/purchaseCart';

interface CartItemProps {
  item: PurchaseCartItem;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (data: UpdateCartItemRequest) => void;
  onDelete: () => void;
  onSplit: (quantity: number) => void;
  submitting: boolean;
}

export const CartItem: React.FC<CartItemProps> = ({
  item,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
  onSplit,
  submitting,
}) => {
  const { message } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(item.quantity);

  const handleSave = () => {
    onUpdate({ quantity });
    setEditing(false);
  };

  const handleSplit = () => {
    if (quantity >= item.quantity) {
      message.warning('拆分数量必须小于当前数量');
      return;
    }
    onSplit(quantity);
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
        background: selected ? 'var(--color-bg-highlight)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Checkbox checked={selected} onChange={onToggleSelect} />
        
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {item.materialName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {item.materialCode} {item.specifications && `| ${item.specifications}`}
          </div>
          
          {item.sourceNo && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              来源：{item.sourceNo} ({item.sourceQuantity}{item.unit})
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>供应商：{item.supplierName || '-'}</span>
            <span style={{ fontSize: 12 }}>数量：</span>
            {editing ? (
              <>
                <InputNumber
                  size="small"
                  value={quantity}
                  onChange={(v) => setQuantity(v || 0)}
                  min={0.01}
                  precision={2}
                  style={{ width: 80 }}
                />
                <Button size="small" type="primary" onClick={handleSave} loading={submitting}>
                  保存
                </Button>
              </>
            ) : (
              <>
                <span>{item.quantity} {item.unit}</span>
                {item.totalAmount && (
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    | ¥{item.totalAmount.toFixed(2)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(!editing)}
          />
          <Button
            type="text"
            size="small"
            icon={<SplitCellsOutlined />}
            onClick={handleSplit}
            disabled={item.quantity <= 1}
          />
          <Popconfirm
            title="确认删除？"
            onConfirm={onDelete}
            okText="确认"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
    </div>
  );
};
