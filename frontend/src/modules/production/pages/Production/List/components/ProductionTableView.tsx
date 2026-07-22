import React from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import { ProductionOrder } from '@/types/production';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';

interface ProductionTableViewProps {
  columns: any[];
  dataSource: ProductionOrder[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  smartQueueFilter: string;
  focusOrderIds: Set<string>;
  selectedRowKeys: React.Key[];
  onRowSelectionChange: (keys: React.Key[], rows: ProductionOrder[]) => void;
  onPageChange: (page: number, pageSize: number) => void;
  focusedOrderId: string | null;
  getOrderDomKey: (record: ProductionOrder) => string;
  navigate: (path: string) => void;
}

const ProductionTableView: React.FC<ProductionTableViewProps> = ({
  columns,
  dataSource,
  loading,
  page,
  pageSize,
  total,
  smartQueueFilter,
  focusOrderIds,
  selectedRowKeys,
  onRowSelectionChange,
  onPageChange,
  focusedOrderId,
  getOrderDomKey,
  navigate,
}) => {
  const showFilteredTotal = smartQueueFilter !== 'all' || focusOrderIds.size > 0;
  const displayTotal = showFilteredTotal ? dataSource.length : total;

  return (
    <ResizableTable<any>
      storageKey="production-order-table"
      columns={columns as any}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 3500 }}
      rowClassName={(record: ProductionOrder) =>
        getOrderDomKey(record) === focusedOrderId ? 'smart-order-focus-row' : ''
      }
      rowSelection={{
        selectedRowKeys,
        onChange: onRowSelectionChange,
      }}
      stickyHeader
      pagination={{
        current: page,
        pageSize,
        total: displayTotal,
        showTotal: (t) => `共 ${t} 条${showFilteredTotal ? '（已筛选）' : ''}`,
        showSizeChanger: true,
        pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
        onChange: onPageChange,
      }}
      showExport={true}
      exportFilename="生产订单.xlsx"
      emptyDescription="暂无生产订单"
      emptyActionText="去创建订单"
      onEmptyAction={() => navigate('/order-management')}
    />
  );
};

export default ProductionTableView;
