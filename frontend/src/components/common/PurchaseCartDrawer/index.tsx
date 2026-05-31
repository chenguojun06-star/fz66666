import React, { useEffect } from 'react';
import { Drawer } from 'antd';
import { usePurchaseCartContext } from '@/context/PurchaseCartContext';
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
    loadCart,
    loadMergeSuggestions,
  } = usePurchaseCartContext();

  useEffect(() => {
    if (open) {
      loadCart();
      loadMergeSuggestions();
    }
  }, [open, loadCart, loadMergeSuggestions]);

  return (
    <Drawer
      title={<CartHeader cart={cart} onClear={clearCart} />}
      placement="right"
      styles={{
        wrapper: { width: '80%' },
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
      }}
      open={open}
      onClose={onClose}
      maskClosable={false}
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
