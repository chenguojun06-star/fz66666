import React, { useState } from 'react';
import { Input, Button, Space, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { AddCartItemRequest } from '@/types/purchaseCart';

interface CartSearchProps {
  onAdd: (request: AddCartItemRequest) => Promise<any>;
  submitting: boolean;
}

export const CartSearch: React.FC<CartSearchProps> = ({ onAdd, submitting }) => {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [material, setMaterial] = useState<any>(null);

  const handleAdd = async () => {
    if (!material) {
      message.warning('请先选择物料');
      return;
    }
    
    const request: AddCartItemRequest = {
      materialCode: material.materialCode,
      materialName: material.materialName,
      materialType: material.materialType || 'FABRIC',
      unit: material.unit || '米',
      quantity: 1,
      supplierId: material.supplierId,
      supplierName: material.supplierName,
      sourceType: 'BATCH',
    };
    
    const result = await onAdd(request);
    if (result?.mergeSuggestion) {
      message.info('发现相同物料，可选择合并');
    } else {
      message.success('已添加到购物车');
      setKeyword('');
      setMaterial(null);
    }
  };

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          style={{ width: 'calc(100% - 80px)' }}
          placeholder="输入物料编码或名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleAdd}
        />
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={handleAdd}
          loading={submitting}
        >
          添加
        </Button>
      </Space.Compact>
    </div>
  );
};
