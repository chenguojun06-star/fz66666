import React from 'react';
import { Drawer } from 'antd';
import { usePurchaseCart } from '@/hooks/usePurchaseCart';
import { CartHeader } from './CartHeader';
import { CartSearch } from './CartSearch';
import { CartList } from './CartList';
import { MergeSuggestionCard } from './MergeSuggestion';
import { CartPreviewModal } from './CartPreview';
import { CartSummary } from './CartSummary';
import type { PurchaseCartDrawerProps } from '@/types/purchaseCart';

export const PurchaseCartDrawer: React.FC<PurchaseCartDrawerProps> = ({
  open,
  onClose,
  onConfirmSuccess,
}) => {
  const {
    cart,
    loading,
    submitting,
    previewVisible,
    previewData,
    mergeSuggestions,
    selectedItems,
    addItem,
    updateItem,
    deleteItem,
    mergeItems,
    splitItem,
    preview,
    confirm,
    clearCart,
    toggleSelect,
    toggleSelectAll,
    setPreviewVisible,
  } = usePurchaseCart({ onConfirmSuccess });

  return (
    <Drawer
      title={<CartHeader cart={cart} onClear={clearCart} />}
      placement="right"
      size={420}
      open={open}
      onClose={onClose}
      maskClosable={false}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <CartSearch onAdd={addItem} submitting={submitting} />
        
        {mergeSuggestions.length > 0 && (
          <MergeSuggestionCard
            suggestions={mergeSuggestions}
            onMerge={mergeItems}
            submitting={submitting}
          />
        )}
        
        <CartList
          items={cart?.items || []}
          loading={loading}
          selectedItems={selectedItems}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onUpdate={updateItem}
          onDelete={deleteItem}
          onSplit={splitItem}
          submitting={submitting}
        />
      </div>
      
      <CartSummary
        cart={cart}
        selectedCount={selectedItems.size}
        onPreview={preview}
        onConfirm={() => confirm(Array.from(selectedItems))}
        submitting={submitting}
      />
      
      <CartPreviewModal
        visible={previewVisible}
        data={previewData}
        onClose={() => setPreviewVisible(false)}
        onConfirm={() => confirm(Array.from(selectedItems))}
        submitting={submitting}
      />
    </Drawer>
  );
};

export default PurchaseCartDrawer;
