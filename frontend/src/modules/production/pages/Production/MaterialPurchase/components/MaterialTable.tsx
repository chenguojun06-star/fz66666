import React, { useState } from 'react';
import { Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '@/types/production';
import { useMaterialColumns } from './useMaterialColumns';
import CancelReceiveModal from './CancelReceiveModal';
import ArrivalConfirmModal from './ArrivalConfirmModal';
import SelectedRowsBar from './SelectedRowsBar';

interface MaterialTableProps {
  loading: boolean;
  dataSource: MaterialPurchaseType[];
  total: number;
  queryParams: MaterialQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<MaterialQueryParams>>;
  isMobile: boolean;
  onView: (record: MaterialPurchaseType) => void;
  onEdit: (record: MaterialPurchaseType) => void;
  onRemark: (record: MaterialPurchaseType) => void;
  onRefresh?: () => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  purchaseSortField: string;
  purchaseSortOrder: 'asc' | 'desc';
  onPurchaseSort: (field: string, order: 'asc' | 'desc') => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onDelete?: (record: MaterialPurchaseType) => void;
  onConfirmReturn?: (record: MaterialPurchaseType) => void;
  onReturnReset?: (record: MaterialPurchaseType) => void;
  onQualityIssue?: (record: MaterialPurchaseType) => void;
  isSupervisorOrAbove?: boolean;
  onOpenDetail?: (styleNo: string, orderNo?: string) => void;
  onBatchAddToCart?: (records: MaterialPurchaseType[]) => void;
}

const MaterialTable: React.FC<MaterialTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  isMobile,
  onView,
  onEdit,
  onRemark,
  onRefresh,
  sortField,
  sortOrder,
  onSort,
  purchaseSortField,
  purchaseSortOrder,
  onPurchaseSort,
  isOrderFrozenForRecord,
  onDelete,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  isSupervisorOrAbove,
  onOpenDetail,
  onBatchAddToCart,
}) => {
  const navigate = useNavigate();
  const [selectedRows, setSelectedRows] = useState<MaterialPurchaseType[]>([]);
  const [cancelTarget, setCancelTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalForm] = Form.useForm();

  const columns = useMaterialColumns({
    dataSource,
    navigate,
    onOpenDetail,
    sortField,
    sortOrder,
    onSort,
    purchaseSortField,
    purchaseSortOrder,
    onPurchaseSort,
    isOrderFrozenForRecord,
    onView,
    onEdit,
    onRemark,
    onDelete,
    onConfirmReturn,
    onReturnReset,
    onQualityIssue,
    isSupervisorOrAbove,
    arrivalForm,
    setArrivalTarget,
    setCancelTarget,
  });

  return (
    <>
      <style>{`.material-row-overdue { background-color: rgba(255, 77, 79, 0.06) !important; }`}</style>
      <CancelReceiveModal
        open={cancelTarget !== null}
        target={cancelTarget}
        onCancel={() => setCancelTarget(null)}
        onSuccess={onRefresh}
      />
      <ArrivalConfirmModal
        open={Boolean(arrivalTarget)}
        target={arrivalTarget}
        form={arrivalForm}
        onCancel={() => setArrivalTarget(null)}
        onSuccess={onRefresh}
      />
      <SelectedRowsBar
        selectedRows={selectedRows}
        onClear={() => setSelectedRows([])}
        onBatchAddToCart={onBatchAddToCart}
      />
      <ResizableTable<MaterialPurchaseType>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        emptyDescription="暂无采购任务"
        rowSelection={{
          selectedRowKeys: selectedRows.map(r => r.id as string),
          onChange: (keys, rows) => setSelectedRows(rows),
        }}
        scroll={{ x: 'max-content' }}
        rowClassName={(record: MaterialPurchaseType) => {
          const s = String(record.status || '').toLowerCase();
          if (['completed', 'cancelled', 'received'].includes(s)) return '';
          const exp = record.expectedShipDate;
          if (exp && new Date(exp).getTime() < Date.now()) return 'material-row-overdue';
          return '';
        }}
        size={isMobile ? 'small' : 'middle'}
        pagination={{
          current: queryParams.page,
          pageSize: queryParams.pageSize,
          total: total,
          onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100', '200'],
          size: isMobile ? 'small' : 'default',
        }}
      />
    </>
  );
};

export default MaterialTable;
