import React, { useMemo, useState, useCallback } from 'react';
import { Space, Button, Popconfirm } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, readPageSize } from '@/utils/pageSizeStore';
import { matchesFilter, canManualCompleteTracking } from './processTrackingFilter';
import type { ProcessTrackingTableProps, ProcessTrackingRecord } from './processTrackingFilter';
import { useProcessTrackingActions } from './useProcessTrackingActions';
import { useProcessTrackingColumns } from './useProcessTrackingColumns';

const ProcessTrackingTable: React.FC<ProcessTrackingTableProps> = ({
  records,
  loading,
  orderId,
  orderNo,
  nodeType,
  nodeName,
  processType,
  orderStatus,
  processList,
  onUndoSuccess,
}) => {
  const [actioningRecordId, setActioningRecordId] = useState<string>('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchCompleting, setBatchCompleting] = useState(false);

  const { _isAdmin, handleUndo, handleManualComplete, handleBatchComplete } = useProcessTrackingActions(
    orderId, orderNo, nodeType, processType, onUndoSuccess,
  );

  const onManualComplete = useCallback((record: ProcessTrackingRecord) => {
    handleManualComplete(record, setActioningRecordId);
  }, [handleManualComplete]);

  const filterType = nodeType || processType;
  const safeRecords = useMemo(() => Array.isArray(records) ? records : [], [records]);

  const filteredRecords = useMemo(() => {
    if (!filterType) return safeRecords;
    return safeRecords.filter(r => matchesFilter(r, filterType, nodeName, processList));
  }, [safeRecords, filterType, nodeName, processList]);

  const flatData = useMemo(() => {
    return [...filteredRecords]
      .sort((a, b) => {
        const bA = Number(a.bundleNo) || 0;
        const bB = Number(b.bundleNo) || 0;
        if (bA !== bB) return bA - bB;
        return (a.processOrder || 0) - (b.processOrder || 0);
      })
      .map(r => ({ ...r, key: `row-${r.id}` }));
  }, [filteredRecords]);

  const stats = useMemo(() => {
    const total = flatData.length;
    const scanned = flatData.filter(r => r.scanStatus === 'scanned').length;
    const totalAmount = flatData.reduce((s, r) => s + (r.settlementAmount || 0), 0);
    const bundles = new Set(flatData.map(r => r.bundleNo)).size;
    return { total, scanned, totalAmount, bundles };
  }, [flatData]);

  const columns = useProcessTrackingColumns({
    actioningRecordId,
    isAdmin: _isAdmin,
    orderStatus,
    orderNo,
    orderId,
    onManualComplete,
    onUndo: handleUndo,
  });

  const completableCount = useMemo(() => {
    return flatData.filter(r => canManualCompleteTracking(r, orderStatus, orderNo, orderId)).length;
  }, [flatData, orderStatus, orderNo, orderId]);

  const selectedCompletableCount = useMemo(() => {
    const selectedRecords = flatData.filter(r => selectedRowKeys.includes(r.key));
    return selectedRecords.filter(r => canManualCompleteTracking(r, orderStatus, orderNo, orderId)).length;
  }, [flatData, selectedRowKeys, orderStatus, orderNo, orderId]);

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    getCheckboxProps: (record: ProcessTrackingRecord) => ({
      disabled: !canManualCompleteTracking(record, orderStatus, orderNo, orderId),
    }),
  };

  const onBatchComplete = useCallback(() => {
    const selectedRecords = flatData.filter(r => selectedRowKeys.includes(r.key));
    handleBatchComplete(selectedRecords, setBatchCompleting, setSelectedRowKeys, orderStatus);
  }, [flatData, selectedRowKeys, handleBatchComplete, orderStatus]);

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filterType && (
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              当前筛选：<strong style={{ color: '#1f2937' }}>{nodeName || filterType}</strong>
            </span>
          )}
          {completableCount > 0 && (
            <Popconfirm
              title="批量完成"
              description={`确定将选中的 ${selectedCompletableCount} 条记录标记为完成？`}
              onConfirm={onBatchComplete}
              okText="确认"
              cancelText="取消"
              disabled={selectedCompletableCount === 0}
            >
              <Button
                type="primary"
               
                loading={batchCompleting}
                disabled={selectedCompletableCount === 0}
              >
                批量完成 ({selectedCompletableCount}/{completableCount})
              </Button>
            </Popconfirm>
          )}
        </div>
        <Space separator={'·'}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            菲号: <strong>{stats.bundles}</strong> 个
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            工序: <strong>{stats.total}</strong> 条
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-success)' }}>
            已扫: <strong>{stats.scanned}</strong> 条
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-success)' }}>
            金额: <strong>{`¥${stats.totalAmount.toFixed(2)}`}</strong>
          </span>
        </Space>
      </div>

      <ResizableTable
        storageKey="process-tracking"
        columns={columns}
        dataSource={flatData}
        loading={loading}
        rowKey="key"
       
        scroll={{ x: 900 }}
        rowSelection={rowSelection}
        pagination={{
          defaultPageSize: readPageSize(DEFAULT_PAGE_SIZE),
          showSizeChanger: true,
          pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
          showTotal: (total) => `共 ${total} 条记录`,
          size: 'small',
        }}
      />
    </div>
  );
};

export default ProcessTrackingTable;
export type { ProcessTrackingTableProps, ProcessTrackingRecord } from './processTrackingFilter';
