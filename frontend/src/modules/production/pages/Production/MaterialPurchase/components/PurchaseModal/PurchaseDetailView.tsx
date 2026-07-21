import React from 'react';
import { Alert, Button, Card, Space, Tag } from 'antd';
import { UploadOutlined, RollbackOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import PurchaseDocRecognizeModal from '../PurchaseDocRecognizeModal';
import PurchaseReturnModal from '../PurchaseReturnModal';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { buildColorSummary, getOrderQtyTotal } from '../../utils';
import {
  confirmedRowStyle,
  normalizeStatus,
} from './PurchaseDetailView.helpers';
import { usePurchaseDetailData } from './usePurchaseDetailData';
import EditablePurchaseTable from './components/EditablePurchaseTable';
import PurchaseDetailCollapse from './components/PurchaseDetailCollapse';
import PurchaseDocHistoryCard from './components/PurchaseDocHistoryCard';
import InvoiceUploadCard from './components/InvoiceUploadCard';
import ArrivalFormModal from './components/ArrivalFormModal';
import RejectPurchaseModal from './components/RejectPurchaseModal';
import MaterialSelectModal from './components/MaterialSelectModal';

interface PurchaseDetailViewProps {
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailLoading: boolean;
  detailSizePairs: Array<{ size: string; quantity: number }>;
  detailFrozen: boolean;
  isMobile: boolean;
  isSupervisorOrAbove: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onReceive: (record: MaterialPurchaseType) => void;
  onConfirmReturn: (record: MaterialPurchaseType) => void;
  onReturnReset: (record: MaterialPurchaseType) => void;
  onQualityIssue: (record: MaterialPurchaseType) => void;
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  isSamplePurchase: boolean;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onWarehousePick?: (record: MaterialPurchaseType, pickQty: number) => void;
  onCancelReceive?: (record: MaterialPurchaseType) => void;
  onConfirmComplete?: () => void;
  confirmCompleteSubmitting?: boolean;
  onRefresh?: () => void;
}

const PurchaseDetailView: React.FC<PurchaseDetailViewProps> = ({
  currentPurchase,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  detailLoading,
  detailSizePairs,
  detailFrozen,
  isMobile,
  isSupervisorOrAbove,
  sortField: _sortField,
  sortOrder: _sortOrder,
  onSort: _onSort,
  onReceive,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  onReceiveAll,
  onBatchReturn,
  isSamplePurchase,
  isOrderFrozenForRecord,
  onWarehousePick,
  onCancelReceive,
  onConfirmComplete: _onConfirmComplete,
  confirmCompleteSubmitting: _confirmCompleteSubmitting,
  onRefresh,
}) => {
  const data = usePurchaseDetailData({
    currentPurchase,
    detailOrder,
    detailOrderLines,
    detailPurchases,
    isSamplePurchase,
    onRefresh,
  });

  const handleArrival = React.useCallback((record: MaterialPurchaseType) => {
    const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
    data.arrivalForm.setFieldsValue({ arrivedQuantity: maxQty });
    data.setArrivalTarget(record);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.arrivalForm, data.setArrivalTarget]);

  const hasPendingForReceiveAll = detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING);
  const hasReceiveStatusForBatch = detailPurchases.some((p) => {
    const status = normalizeStatus(p.status);
    return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
      || status === MATERIAL_PURCHASE_STATUS.PARTIAL
      || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
      && Number(p?.returnConfirmed || 0) !== 1;
  });
  const hasReceiveStatusForReturn = detailPurchases.some((p) => {
    const status = normalizeStatus(p.status);
    return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
      || status === MATERIAL_PURCHASE_STATUS.PARTIAL
      || status === MATERIAL_PURCHASE_STATUS.COMPLETED);
  });
  const hasReturnConfirmed = detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1);

  const returnablePurchases = detailPurchases.filter((p) => {
    const status = normalizeStatus(p.status);
    return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
      || status === MATERIAL_PURCHASE_STATUS.PARTIAL
      || status === MATERIAL_PURCHASE_STATUS.COMPLETED);
  });

  return (
    <div className="purchase-detail-view">
      <style>{confirmedRowStyle}</style>
      <ProductionOrderHeader
        order={detailOrder}
        orderLines={detailOrderLines}
        orderNo={currentPurchase?.orderNo}
        styleNo={currentPurchase?.styleNo}
        styleName={currentPurchase?.styleName}
        styleId={currentPurchase?.styleId}
        styleCover={currentPurchase?.styleCover}
        color={String(detailOrder?.color || currentPurchase?.color || '').trim() || buildColorSummary(detailOrderLines) || ''}
        sizeItems={detailSizePairs.map((x) => ({ size: x.size, quantity: x.quantity }))}
        totalQuantity={getOrderQtyTotal(detailOrderLines)}
        showOrderNo={!isSamplePurchase}
        hideEmptyColor={isSamplePurchase}
        hideSizeBlockWhenNoRealSize={isSamplePurchase}
        coverSize={80}
      />

      {data.missingColors.length > 0 && !data.editing && (
        <Alert
          type="warning"
          showIcon
          title="颜色覆盖不完整"
          description={
            <span>
              订单包含 <strong>{data.orderColors.length}</strong> 种颜色（{data.orderColors.join('、')}），
              但以下颜色缺少采购物料记录：<strong style={{ color: 'var(--color-error)' }}>{data.missingColors.join('、')}</strong>。
              请点击「编辑面辅料」为每个颜色分别添加面辅料信息。
            </span>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Card
        title={`需要采购的面辅料（${data.displayData.length}项）`}
        loading={detailLoading}
        extra={
          <Space wrap>
            {!data.editing && (
              <>
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => data.setDocRecognizeOpen(true)}
                  disabled={hasReturnConfirmed}
                >
                  上传采购单
                </Button>
                <Button
                  type="primary"
                  disabled={detailFrozen || !hasPendingForReceiveAll || !data.canProcure || hasReturnConfirmed}
                  onClick={onReceiveAll}
                >
                  采购全部
                </Button>
                {data.bomIncomplete && (
                  <Tag icon={<ExclamationCircleOutlined />} color="warning" style={{ marginLeft: 4 }}>
                    请先编辑物料信息
                  </Tag>
                )}
                <Button
                  disabled={detailFrozen || !hasReceiveStatusForBatch}
                  onClick={onBatchReturn}
                >
                  批量回料确认
                </Button>
                <Button
                  icon={<RollbackOutlined />}
                  disabled={detailFrozen || !hasReceiveStatusForReturn}
                  onClick={() => data.setReturnModalOpen(true)}
                >
                  采购退货
                </Button>
                <Button
                  type="primary"
                  onClick={data.handleStartEdit}
                  disabled={hasReturnConfirmed}
                >
                  编辑面辅料
                </Button>
              </>
            )}
            {data.editing && (
              <>
                <Button type="dashed" onClick={data.addRow}>添加物料</Button>
                <Button type="primary" loading={data.saving} onClick={data.saveAll}>保存</Button>
                <Button onClick={data.cancelEditing}>取消</Button>
              </>
            )}
          </Space>
        }
      >
        {data.editing ? (
          <EditablePurchaseTable
            dataSource={data.displayData}
            isMobile={isMobile}
            isMultiColor={data.isMultiColor}
            orderColors={data.orderColors}
            onAddRow={data.addRow}
            onUpdateRow={data.updateRow}
            onRemoveRow={data.handleRemoveRowWithConfirm}
            onOpenMaterialModal={data.openMaterialModal}
          />
        ) : detailPurchases.length === 0 && !detailLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <Alert
              type="info"
              showIcon
              title="该订单尚未创建面辅料信息"
              description={
                data.orderColors.length > 1
                  ? `订单包含 ${data.orderColors.length} 种颜色（${data.orderColors.join('、')}），点击「编辑面辅料」按钮为每种颜色创建对应的面辅料记录。`
                  : '点击上方「编辑面辅料」按钮，为订单添加面辅料信息（物料编码、名称、单位、供应商等），完善后才可进行采购。'
              }
              style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}
              action={
                <Button type="primary" size="small" onClick={data.handleStartEdit}>
                  编辑面辅料
                </Button>
              }
            />
          </div>
        ) : (
          <PurchaseDetailCollapse
            detailPurchases={detailPurchases}
            isMobile={isMobile}
            stockMap={data.stockMap}
            isSupervisorOrAbove={isSupervisorOrAbove}
            isOrderFrozenForRecord={isOrderFrozenForRecord}
            onReceive={onReceive}
            onConfirmReturn={onConfirmReturn}
            onReturnReset={onReturnReset}
            onQualityIssue={onQualityIssue}
            onCancelReceive={onCancelReceive}
            onWarehousePick={onWarehousePick}
            onArrival={handleArrival}
            onCancelTarget={data.setCancelTarget}
          />
        )}
      </Card>

      <PurchaseDocHistoryCard docList={data.docList} docsLoading={data.docsLoading} />

      <InvoiceUploadCard
        invoiceUrls={data.invoiceUrls}
        invoiceUploading={data.invoiceUploading}
        disabled={!currentPurchase?.id}
        onChange={data.handleInvoiceChange}
        uploadFn={data.handleInvoiceUpload}
      />

      <RejectPurchaseModal
        open={data.cancelTarget !== null}
        target={data.cancelTarget}
        loading={data.cancelConfirmLoading}
        onOk={data.handleCancelConfirm}
        onCancel={() => data.setCancelTarget(null)}
      />

      <ArrivalFormModal
        open={Boolean(data.arrivalTarget)}
        target={data.arrivalTarget}
        loading={data.arrivalLoading}
        form={data.arrivalForm}
        onSubmit={data.handleArrivalSubmit}
        onCancel={() => { data.setArrivalTarget(null); data.arrivalForm.resetFields(); }}
      />

      <PurchaseDocRecognizeModal
        open={data.docRecognizeOpen}
        orderNo={String(currentPurchase?.orderNo || '').trim() || undefined}
        onCancel={() => data.setDocRecognizeOpen(false)}
        onSuccess={async () => {
          data.setDocRecognizeOpen(false);
          onRefresh?.();
        }}
      />

      {/* 采购退货弹窗 */}
      <PurchaseReturnModal
        visible={data.returnModalOpen}
        purchaseRecords={returnablePurchases}
        originalPurchaseId={currentPurchase?.id || ''}
        supplierName={currentPurchase?.supplierName || ''}
        onClose={() => data.setReturnModalOpen(false)}
        onSuccess={async () => {
          data.setReturnModalOpen(false);
          onRefresh?.();
        }}
      />

      <MaterialSelectModal
        open={data.materialModalOpen}
        keyword={data.materialKeyword}
        loading={data.materialLoading}
        list={data.materialList}
        total={data.materialTotal}
        page={data.materialPage}
        pageSize={data.materialPageSize}
        onKeywordChange={data.setMaterialKeyword}
        onSearch={data.handleSearchMaterial}
        onPageChange={(page, pageSize) => {
          data.setMaterialPage(page);
          data.setMaterialPageSize(pageSize);
        }}
        onUse={data.handleUseMaterial}
        onCancel={() => data.setMaterialModalOpen(false)}
      />
    </div>
  );
};

export default PurchaseDetailView;
