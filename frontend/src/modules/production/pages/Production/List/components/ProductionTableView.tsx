import React from 'react';
import { Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
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
  /** D-611 勾选行批量打印生产单（无此回调时隐藏批量条） */
  onBatchPrint?: (rows: ProductionOrder[]) => void;
  /** 置顶行 id 集合：命中行加置顶底色标识 */
  pinnedOrderIds?: Set<string>;
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
  onBatchPrint,
  pinnedOrderIds,
}) => {
  const showFilteredTotal = smartQueueFilter !== 'all' || focusOrderIds.size > 0;
  const displayTotal = showFilteredTotal ? dataSource.length : total;

  // D-611 批量条：勾选行 > 0 且提供回调时出现，映射当前页选中行交给页面打开批量打印
  const selectedRows = onBatchPrint
    ? dataSource.filter((r) => selectedRowKeys.includes((r as any).id))
    : [];

  return (
    <>
      {selectedRows.length > 0 && (
        <div
          style={{
            marginBottom: 8, padding: '8px 16px',
            background: 'var(--status-processing-bg)',
            border: '1px solid var(--status-processing-border)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 16,
          }}
        >
          <span style={{ fontWeight: 600 }}>已选 {selectedRows.length} 单</span>
          <Button
            type="primary"
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => onBatchPrint?.(selectedRows)}
          >
            批量打印生产单
          </Button>
          <Button size="small" onClick={() => onRowSelectionChange([], [])}>取消选择</Button>
        </div>
      )}
      <ResizableTable<any>
      storageKey="production-order-table"
      columns={columns as any}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      // D-327：写死 3500px + tableLayout:fixed 会把 3500px 均摊到可见列，列全被拉宽一大圈；
      // max-content = 各列按定义宽度收紧，与其他列表页一致
      scroll={{ x: 'max-content' }}
      rowClassName={(record: ProductionOrder) => {
        if (getOrderDomKey(record) === focusedOrderId) return 'smart-order-focus-row';
        if (pinnedOrderIds?.has(String(record.id))) return 'prod-row-pinned';
        return '';
      }}
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
    </>
  );
};

export default ProductionTableView;
