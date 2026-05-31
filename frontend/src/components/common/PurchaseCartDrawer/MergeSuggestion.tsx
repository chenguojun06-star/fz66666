import React from 'react';
import { Card, Button, List, App } from 'antd';
import type { MergeSuggestion } from '@/types/purchaseCart';

interface MergeSuggestionCardProps {
  suggestions: MergeSuggestion[];
  onMerge: (request: any) => void;
  submitting: boolean;
}

export const MergeSuggestionCard: React.FC<MergeSuggestionCardProps> = ({
  suggestions,
  onMerge,
  submitting,
}) => {
  if (suggestions.length === 0) return null;

  const handleMerge = (suggestion: MergeSuggestion) => {
    const totalQty = suggestion.items.reduce((sum, item) => sum + item.quantity, 0);
    
    onMerge({
      itemIds: suggestion.items.map(item => item.id),
      targetQuantity: totalQty,
      targetSupplierId: suggestion.items[0].id,
      targetSupplierName: suggestion.items[0].supplierName,
    });
  };

  return (
    <Card
      size="small"
      title={
        <span style={{ color: 'var(--color-warning)' }}>
          🔔 推荐合并 ({suggestions.length})
        </span>
      }
      style={{ margin: 12 }}
    >
      {suggestions.map((suggestion, index) => (
        <div key={index} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {suggestion.materialName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {suggestion.materialCode}
          </div>
          <List
            size="small"
            dataSource={suggestion.items}
            renderItem={(item) => (
              <List.Item style={{ padding: '4px 0' }}>
                <span>{item.supplierName}: {item.quantity}</span>
              </List.Item>
            )}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              size="small"
              type="primary"
              onClick={() => handleMerge(suggestion)}
              loading={submitting}
            >
              合并
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
};
