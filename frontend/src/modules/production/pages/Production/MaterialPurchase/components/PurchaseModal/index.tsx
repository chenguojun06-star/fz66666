import React from 'react';
import { Button, Dropdown } from 'antd';
import type { FormInstance } from 'antd/es/form';
import ResizableModal from '@/components/common/ResizableModal';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import PurchaseDetailView from './PurchaseDetailView';
import PurchaseCreateForm from './PurchaseCreateForm';
import PurchasePreviewView from './PurchasePreviewView';

interface PurchaseModalProps {
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
  onCancel: () => void;
  modalWidth: number;
  modalInitialHeight: number;
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
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  isSamplePurchase: boolean;
  onGeneratePurchaseSheet: (autoPrint: boolean) => void;
  onDownloadPurchaseSheet: () => void;
  onSaveCreate: () => void;
  onSavePreview: () => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({
  visible,
  dialogMode,
  onCancel,
  modalWidth,
  modalInitialHeight,
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
  onReceiveAll,
  onBatchReturn,
  isSamplePurchase,
  onGeneratePurchaseSheet,
  onDownloadPurchaseSheet,
  onSaveCreate,
  onSavePreview,
  isOrderFrozenForRecord,
}) => {
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();

  const getFooter = () => {
    if (dialogMode === 'view') {
      return [
        !isSamplePurchase ? (
          <Button
            key="receiveAll"
            disabled={!detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING)}
            loading={submitLoading}
            onClick={onReceiveAll}
          >
            采购领取
          </Button>
        ) : null,
        <Button
          key="returnAll"
          disabled={!detailPurchases.some((p) => {
            const status = normalizeStatus(p.status);
            return status === MATERIAL_PURCHASE_STATUS.RECEIVED
              || status === MATERIAL_PURCHASE_STATUS.PARTIAL
              || status === MATERIAL_PURCHASE_STATUS.COMPLETED;
          })}
          loading={submitLoading}
          onClick={onBatchReturn}
        >
          回料确认
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
          <Button disabled={detailLoading || !detailPurchases.length}>
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
    <ResizableModal
      title={dialogMode === 'preview' ? '采购清单预览' : dialogMode === 'create' ? '新增采购单' : '采购单详情'}
      open={visible}
      onCancel={onCancel}
      width={modalWidth}
      initialHeight={modalInitialHeight}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
      tableDensity={isMobile ? 'dense' : 'auto'}
      footer={getFooter()}
    >
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
          onReceiveAll={onReceiveAll}
          onBatchReturn={onBatchReturn}
          isSamplePurchase={isSamplePurchase}
          isOrderFrozenForRecord={isOrderFrozenForRecord}
        />
      ) : (
        <PurchaseCreateForm form={form} />
      )}
    </ResizableModal>
  );
};

export default PurchaseModal;
