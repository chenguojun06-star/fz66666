import React from 'react';
import ExternalFactorySmartView from '../../ExternalFactory/ExternalFactorySmartView';
import { ProductionOrder } from '@/types/production';

interface ProductionSmartViewProps {
  data: ProductionOrder[];
  loading: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  openProcessDetail: (record: ProductionOrder, type: string) => void;
  openNodeDetail: (order: ProductionOrder, type: string, name: string) => void;
  syncProcessFromTemplate: (order: ProductionOrder) => void;
  quickEditModal: { open: (data: ProductionOrder) => void };
  handleShareOrder: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void;
  canManageOrderLifecycle: boolean;
  isSupervisorOrAbove: boolean;
  openSubProcessRemap: (record: ProductionOrder) => void;
  isFactoryAccount: boolean;
  onOpenRemark: (record: ProductionOrder) => void;
  smartQueueFilter: string;
  focusOrderIds: Set<string>;
}

const ProductionSmartView: React.FC<ProductionSmartViewProps> = ({
  data,
  loading,
  total,
  currentPage,
  pageSize,
  onPageChange,
  handleCloseOrder,
  handleScrapOrder,
  openProcessDetail,
  openNodeDetail,
  syncProcessFromTemplate,
  quickEditModal,
  handleShareOrder,
  handlePrintLabel,
  canManageOrderLifecycle,
  isSupervisorOrAbove,
  openSubProcessRemap,
  isFactoryAccount,
  onOpenRemark,
  smartQueueFilter,
  focusOrderIds,
}) => {
  const showFilteredTotal = smartQueueFilter !== 'all' || focusOrderIds.size > 0;
  const displayTotal = showFilteredTotal ? data.length : total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ExternalFactorySmartView
        data={data}
        loading={loading}
        total={displayTotal}
        currentPage={currentPage}
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
        onOpenRemark={onOpenRemark}
      />
    </div>
  );
};

export default ProductionSmartView;
