import React from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import { ProductWarehousing as WarehousingType, WarehousingQueryParams } from '@/types/production';
import { useWarehousingTableData } from './useWarehousingTableData';
import { buildColumns } from './columns';

interface WarehousingTableProps {
  loading: boolean;
  dataSource: WarehousingType[];
  total: number;
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  isOrderFrozen: (orderId: string) => boolean;
  isMobile?: boolean;
  onOpenInspect?: (orderId: string, tab?: string) => void;
}

const WarehousingTable: React.FC<WarehousingTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  isOrderFrozen,
  isMobile: _isMobile,
  onOpenInspect,
}) => {
  const { goToDetail } = useWarehousingTableData({ onOpenInspect });
  const columns = buildColumns({ goToDetail, isOrderFrozen, dataSource });

  return (
    <ResizableTable
      storageKey="warehousing-table"
      columns={columns as any}
      dataSource={dataSource as any[]}
      rowKey="id"
      loading={loading}
      emptyDescription="暂无入库数据"
      scroll={{ x: 'max-content' }}
      pagination={{
        current: queryParams.page,
        pageSize: queryParams.pageSize,
        total: total,
        showTotal: (total) => `共 ${total} 条`,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
      }}
    />
  );
};

export default WarehousingTable;
