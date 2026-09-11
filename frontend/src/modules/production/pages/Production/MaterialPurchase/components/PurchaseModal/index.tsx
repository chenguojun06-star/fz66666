import React, { useMemo } from 'react';
import { Button, Drawer } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import PurchaseDetailView from './PurchaseDetailView';
import PurchaseCreateForm from './PurchaseCreateForm';
import PurchasePreviewView from './PurchasePreviewView';

interface PurchaseModalProps {
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
  onCancel: () => void;
  isMobile: boolean;
  submitLoading: boolean;

  // Data for View Mode
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailLoading: boolean;
  detailSizePairs: Array<{ size: string; quantity: number }>;
  detailFrozen: boolean;

  // Data for Preview Mode
  previewList: MaterialPurchaseType[];
  previewOrderId: string;

  // Handlers & Utils
  isSupervisorOrAbove: boolean;
  form: FormInstance;
  user: any;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onReceive: (record: MaterialPurchaseType) => void;
  onConfirmReturn: (record: MaterialPurchaseType) => void;
  onReturnReset: (record: MaterialPurchaseType) => void;
  onQualityIssue: (record: MaterialPurchaseType) => void;
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  onConfirmComplete: () => void;
  confirmCompleteSubmitting: boolean;
  isSamplePurchase: boolean;
  onGeneratePurchaseSheet: (autoPrint: boolean) => void;
  onDownloadPurchaseSheet: () => void;
  onSaveCreate: () => void;
  onSavePreview: () => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onWarehousePick?: (record: MaterialPurchaseType, pickQty: number) => void;
  onRefresh?: () => void;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({
  visible,
  dialogMode,
  onCancel,
  isMobile,
  submitLoading,
  currentPurchase,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  detailLoading,
  detailSizePairs,
  detailFrozen,
  previewList,
  previewOrderId: _previewOrderId,
  isSupervisorOrAbove,
  form,
  user: _user,
  sortField,
  sortOrder,
  onSort,
  onReceive,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  onReceiveAll,
  onBatchReturn,
  onConfirmComplete,
  confirmCompleteSubmitting,
  isSamplePurchase,
  onGeneratePurchaseSheet,
  onDownloadPurchaseSheet,
  onSaveCreate,
  onSavePreview,
  isOrderFrozenForRecord,
  onWarehousePick,
  onRefresh,
}) => {
  const _normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    (detailOrderLines || []).forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [detailOrderLines]);

  const getFooter = () => {
    // 详情模式按钮已统一收进「面辅料」卡片操作条（PurchaseActionBar），footer 只留关闭
    if (dialogMode === 'view') {
      return [
        <Button key="close" type="primary" onClick={onCancel}>
          关闭
        </Button>
      ];
    }

    if (dialogMode === 'preview') {
      return [
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitLoading}
          onClick={onSavePreview}
        >
          保存生成
        </Button>
      ];
    }

    // Create Mode
    return [
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="submit" type="primary" onClick={onSaveCreate} loading={submitLoading}>
        保存
      </Button>
    ];
  };

  return (
    <Drawer
      title={dialogMode === 'preview' ? '采购清单预览' : dialogMode === 'create' ? '新增采购单' : '采购单详情'}
      open={visible}
      onClose={onCancel}
      placement="right"
      styles={{
        wrapper: { width: isMobile ? '96vw' : '85%' },
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
        footer: { padding: '12px 16px' },
      }}
      maskClosable={false}
      footer={getFooter()}
    >
      <div style={{ padding: '16px', flex: 1, overflow: 'auto' }}>
        {dialogMode === 'preview' ? (
          <PurchasePreviewView previewList={previewList} isMobile={isMobile} />
        ) : dialogMode === 'view' ? (
          <PurchaseDetailView
            currentPurchase={currentPurchase}
            detailOrder={detailOrder}
            detailOrderLines={detailOrderLines}
            detailPurchases={detailPurchases}
            detailLoading={detailLoading}
            detailSizePairs={detailSizePairs}
            detailFrozen={detailFrozen}
            isMobile={isMobile}
            isSupervisorOrAbove={isSupervisorOrAbove}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
            onReceive={onReceive}
            onConfirmReturn={onConfirmReturn}
            onReturnReset={onReturnReset}
            onQualityIssue={onQualityIssue}
            onReceiveAll={onReceiveAll}
            onBatchReturn={onBatchReturn}
            onConfirmComplete={onConfirmComplete}
            confirmCompleteSubmitting={confirmCompleteSubmitting}
            isSamplePurchase={isSamplePurchase}
            isOrderFrozenForRecord={isOrderFrozenForRecord}
            onWarehousePick={onWarehousePick}
            onRefresh={onRefresh}
            onGeneratePurchaseSheet={onGeneratePurchaseSheet}
            onDownloadPurchaseSheet={onDownloadPurchaseSheet}
          />
        ) : (
          <PurchaseCreateForm form={form} orderColors={orderColors} />
        )}
      </div>
    </Drawer>
  );
};

export default PurchaseModal;
