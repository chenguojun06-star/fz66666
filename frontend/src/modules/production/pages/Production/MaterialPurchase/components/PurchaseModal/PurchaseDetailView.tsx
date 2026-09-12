import React, { useState } from 'react';
import { Alert, Button, Card, Tag } from 'antd';
import { RollbackOutlined, ExclamationCircleOutlined, FileImageOutlined } from '@ant-design/icons';
import PurchaseReturnModal from '../PurchaseReturnModal';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { PurchaseActionBar, PurchaseEditActions } from '@/components/common/purchase/PurchaseActionBar';
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
import PurchaseDocDrawer from '../PurchaseDocDrawer';
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
  /** 打印/下载采购单（D-360c，收进 PurchaseActionBar 打印/下载采购单入口） */
  onGeneratePurchaseSheet?: (autoPrint: boolean) => void;
  onDownloadPurchaseSheet?: () => void;
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
  onConfirmComplete,
  confirmCompleteSubmitting,
  onRefresh,
  onGeneratePurchaseSheet,
  onDownloadPurchaseSheet,
}) => {
  const data = usePurchaseDetailData({
    currentPurchase,
    detailOrder,
    detailOrderLines,
    detailPurchases,
    isSamplePurchase,
    onRefresh,
  });

  const [docDrawerOpen, setDocDrawerOpen] = useState(false);

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
  // D-333：批量"确认回料完成"与样衣侧（MaterialPurchaseDetail）同口径——存在待确认行即可用
  const hasAwaitingConfirm = detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);
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
          data.editing ? (
            <PurchaseEditActions
              onAdd={data.addRow}
              onSave={data.saveAll}
              saving={data.saving}
              onCancel={data.cancelEditing}
            />
          ) : (
            // D-360：按钮统一一行（跟随样衣 PurchaseActionBar 布局），顶部不再散落按钮
            <PurchaseActionBar
              receive={{
                // D-360x：部分行已回料确认不再整体禁用——只要还有待领取行就可用（行级各自校验）
                disabled: detailFrozen || !hasPendingForReceiveAll || !data.canProcure,
                title: !hasPendingForReceiveAll ? '无可领取项' : undefined,
                onClick: onReceiveAll,
              }}
              batchReturn={{
                disabled: detailFrozen || !hasReceiveStatusForBatch,
                onClick: onBatchReturn,
              }}
              confirmComplete={{
                disabled: confirmCompleteSubmitting || !hasAwaitingConfirm,
                loading: confirmCompleteSubmitting,
                title: hasAwaitingConfirm ? undefined : '无待完成项',
                onClick: () => onConfirmComplete?.(),
              }}
              edit={{
                disabled: hasReturnConfirmed,
                onClick: data.handleStartEdit,
              }}
              extraTags={data.bomIncomplete ? (
                <Tag icon={<ExclamationCircleOutlined />} color="warning">
                  请先编辑物料信息
                </Tag>
              ) : null}
              sheet={{
                disabled: detailLoading || !detailPurchases.length,
                onPrint: () => onGeneratePurchaseSheet?.(true),
                onDownload: () => onDownloadPurchaseSheet?.(),
              }}
              extraButtons={(
                <>
                  <Button
                    size="small"
                    icon={<FileImageOutlined />}
                    onClick={() => setDocDrawerOpen(true)}
                    disabled={hasReturnConfirmed}
                  >
                    采购单据
                  </Button>
                  <Button
                    size="small"
                    icon={<RollbackOutlined />}
                    disabled={detailFrozen || !hasReceiveStatusForReturn}
                    onClick={() => data.setReturnModalOpen(true)}
                  >
                    采购退货
                  </Button>
                </>
              )}
            />
          )
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

      {/* D-360f：采购单据统一入口——上传/识别 + 历史单据缩略图（50% 侧滑抽屉），替代原散落的「上传采购单」弹窗与历史卡片 */}
      <PurchaseDocDrawer
        open={docDrawerOpen}
        orderNo={String(currentPurchase?.orderNo || '').trim() || undefined}
        styleNo={String(currentPurchase?.orderNo || '').trim() ? undefined : (String(currentPurchase?.styleNo || '').trim() || undefined)}
        onClose={() => setDocDrawerOpen(false)}
        onChanged={onRefresh}
      />

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
