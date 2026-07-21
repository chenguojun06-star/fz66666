import React from 'react';
import { Button, Space } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

interface SelectedRowsBarProps {
  selectedRows: MaterialPurchaseType[];
  onClear: () => void;
  onBatchAddToCart?: (records: MaterialPurchaseType[]) => void;
}

/**
 * 选中行批量操作栏（清空 + 加入购物车）。
 * 当 selectedRows 为空时返回 null。
 */
const SelectedRowsBar: React.FC<SelectedRowsBarProps> = ({ selectedRows, onClear, onBatchAddToCart }) => {
  if (selectedRows.length === 0) return null;
  return (
    <div style={{
      padding: '8px 16px',
      marginBottom: 8,
      background: 'var(--color-bg-highlight)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <Space>
        <span>已选择 <strong>{selectedRows.length}</strong> 项</span>
        <Button size="small" onClick={onClear}>清空</Button>
      </Space>
      <Button
        type="primary"
        icon={<ShoppingCartOutlined />}
        size="small"
        onClick={() => onBatchAddToCart?.(selectedRows)}
      >
        加入购物车
      </Button>
    </div>
  );
};

export default SelectedRowsBar;
