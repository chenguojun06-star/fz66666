import React from 'react';
import ProductionTableView from './ProductionTableView';
import ProductionSmartView from './ProductionSmartView';
import ProductionCardView from './ProductionCardView';
import { ProductionOrder } from '@/types/production';

interface ProductionContentViewProps {
  viewMode: 'list' | 'card' | 'smart';
  sortedProductionList: ProductionOrder[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  smartQueueFilter: string;
  focusOrderIds: Set<string>;
  selectedRowKeys: React.Key[];
  onRowSelectionChange: (keys: React.Key[], rows: ProductionOrder[]) => void;
  onPageChange: (page: number, pageSize: number) => void;
  focusedOrderId: string | null;
  getOrderDomKey: (record: ProductionOrder) => string;
  navigate: (path: string) => void;
  columns: any[];
  cardColumns: number;
  calcCardProgress: (record: ProductionOrder) => number;
  patrolTitleTags: (record: ProductionOrder) => React.ReactNode;
  quickEditModal: { open: (data: ProductionOrder) => void; visible: boolean; data: ProductionOrder | null; close: () => void };
  printModal: { open: (data: ProductionOrder) => void };
  handlePrintLabel: (record: ProductionOrder) => void;
  openProcessDetail: (record: ProductionOrder, type: string) => void;
  openSubProcessRemap: (record: ProductionOrder) => void;
  smartReceiveModal: { open: (data: string) => void };
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  handleCopyOrder: (record: ProductionOrder) => void;
  handleShareOrder: (record: ProductionOrder) => void;
  canManageOrderLifecycle: boolean;
  isSupervisorOrAbove: boolean;
  isFactoryAccount: boolean;
  setRemarkTarget: (target: { open: boolean; orderNo: string; merchandiser?: string; defaultRole?: string }) => void;
  openNodeDetail: (order: ProductionOrder, type: string, name: string) => void;
  syncProcessFromTemplate: (order: ProductionOrder) => void;
  handleSmartOpenRemark: (record: ProductionOrder) => void;
}

const ProductionContentView: React.FC<ProductionContentViewProps> = ({
  viewMode,
  sortedProductionList,
  loading,
  total,
  page,
  pageSize,
  smartQueueFilter,
  focusOrderIds,
  selectedRowKeys,
  onRowSelectionChange,
  onPageChange,
  focusedOrderId,
  getOrderDomKey,
  navigate,
  columns,
  cardColumns,
  calcCardProgress,
  patrolTitleTags,
  quickEditModal,
  printModal,
  handlePrintLabel,
  openProcessDetail,
  openSubProcessRemap,
  smartReceiveModal,
  handleCloseOrder,
  handleScrapOrder,
  handleCopyOrder,
  handleShareOrder,
  canManageOrderLifecycle,
  isSupervisorOrAbove,
  isFactoryAccount,
  setRemarkTarget,
  openNodeDetail,
  syncProcessFromTemplate,
  handleSmartOpenRemark,
}) => {
  if (viewMode === 'smart') {
    return (
      <ProductionSmartView
        data={sortedProductionList}
        loading={loading}
        total={total}
        currentPage={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        handleCloseOrder={handleCloseOrder}
        handleScrapOrder={handleScrapOrder}
        openProcessDetail={openProcessDetail}
        openNodeDetail={openNodeDetail}
        syncProcessFromTemplate={syncProcessFromTemplate}
        quickEditModal={quickEditModal}
        handleShareOrder={handleShareOrder}
        handlePrintLabel={handlePrintLabel}
        canManageOrderLifecycle={canManageOrderLifecycle}
        isSupervisorOrAbove={isSupervisorOrAbove}
        openSubProcessRemap={openSubProcessRemap}
        isFactoryAccount={isFactoryAccount}
        onOpenRemark={handleSmartOpenRemark}
        smartQueueFilter={smartQueueFilter}
        focusOrderIds={focusOrderIds}
      />
    );
  }

  if (viewMode === 'list') {
    return (
      <ProductionTableView
        columns={columns}
        dataSource={sortedProductionList}
        loading={loading}
        page={page}
        pageSize={pageSize}
        total={total}
        smartQueueFilter={smartQueueFilter}
        focusOrderIds={focusOrderIds}
        selectedRowKeys={selectedRowKeys}
        onRowSelectionChange={onRowSelectionChange}
        onPageChange={onPageChange}
        focusedOrderId={focusedOrderId}
        getOrderDomKey={getOrderDomKey}
        navigate={navigate}
      />
    );
  }

  return (
    <ProductionCardView
      sortedProductionList={sortedProductionList}
      cardColumns={cardColumns}
      page={page}
      pageSize={pageSize}
      handlePageChange={onPageChange}
      smartQueueFilter={smartQueueFilter}
      focusOrderIds={focusOrderIds}
      total={total}
      focusedOrderId={focusedOrderId}
      getOrderDomKey={getOrderDomKey}
      calcCardProgress={calcCardProgress}
      patrolTitleTags={patrolTitleTags}
      navigate={navigate}
      quickEditModal={quickEditModal}
      printModal={printModal}
      handlePrintLabel={handlePrintLabel}
      openProcessDetail={openProcessDetail}
      openSubProcessRemap={openSubProcessRemap}
      smartReceiveModal={smartReceiveModal}
      handleCloseOrder={handleCloseOrder}
      handleScrapOrder={handleScrapOrder}
      handleCopyOrder={handleCopyOrder}
      handleShareOrder={handleShareOrder}
      canManageOrderLifecycle={canManageOrderLifecycle}
      isSupervisorOrAbove={isSupervisorOrAbove}
      isFactoryAccount={isFactoryAccount}
      setRemarkTarget={setRemarkTarget}
    />
  );
};

export default ProductionContentView;
