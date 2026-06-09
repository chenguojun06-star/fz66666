import React, { useMemo } from 'react';
import { Button, Dropdown, Drawer } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
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
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    (detailOrderLines || []).forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [detailOrderLines]);

  const getFooter = () => {
    if (dialogMode === 'view') {
      return [
        <Button
          key="receiveAll"
          disabled={!detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING) || detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}
          loading={submitLoading}
          onClick={onReceiveAll}
        >
          采购全部
        </Button>,
        <Button
          key="returnAll"
          disabled={!detailPurchases.some((p) => {
            const status = normalizeStatus(p.status);
            return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
              || status === MATERIAL_PURCHASE_STATUS.PARTIAL
              || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
              && Number(p?.returnConfirmed || 0) !== 1;
          })}
          loading={submitLoading}
          onClick={onBatchReturn}
        >
          回料确认
        </Button>,
        <Button
          key="confirmComplete"
          disabled={!detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM) || detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}
          loading={confirmCompleteSubmitting}
          onClick={onConfirmComplete}
        >
          确认完成
        </Button>,
        <Dropdown
          key="sheet"
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'print',
                label: '打印采购单',
                onClick: () => onGeneratePurchaseSheet(true),
              },
              {
                key: 'download',
                label: '下载采购单',
                onClick: () => onDownloadPurchaseSheet(),
              },
            ],
          }}
        >
          <Button disabled={detailLoading || !detailPurchases.length || detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}>
            采购单生成
          </Button>
        </Dropdown>,
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
        wrapper: { width: isMobile ? '96vw' : Math.min(1600, Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.85 : 1600)) },
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
            isSamplePurchase={isSamplePurchase}
            isOrderFrozenForRecord={isOrderFrozenForRecord}
            onWarehousePick={onWarehousePick}
            onRefresh={onRefresh}
          />
        ) : (
          <PurchaseCreateForm form={form} orderColors={orderColors} />
        )}
      </div>
    </Drawer>
  );
};

export default PurchaseModal;
