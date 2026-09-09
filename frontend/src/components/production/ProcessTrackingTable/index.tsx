import React, { useMemo, useState, useCallback } from 'react';
import { Space, Button, Popconfirm } from 'antd';
import { SendOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, readPageSize } from '@/utils/pageSizeStore';
import { matchesFilter, canManualCompleteTracking, isWarehousingType } from './processTrackingFilter';
import { paths } from '@/routeConfig';
import type { ProcessTrackingTableProps, ProcessTrackingRecord } from './processTrackingFilter';
import { useProcessTrackingActions } from './useProcessTrackingActions';
import { useProcessTrackingColumns } from './useProcessTrackingColumns';
import { useExtColumns } from '@/hooks/useExtColumns';
import { useColumnSettings, ColumnSettingsDrawer } from '@/components/common/ColumnSettings';

// D-325 显示字段：字段全由系统预设，用户只挑显隐（与全站各列表页同一套）
const PROCESS_TRACKING_COLUMNS = [
  { key: 'bundleNo', label: '菲号' },
  { key: 'processName', label: '工序' },
  { key: 'color', label: '颜色' },
  { key: 'size', label: '尺码' },
  { key: 'quantity', label: '数量' },
  { key: 'unitPrice', label: '单价' },
  { key: 'scanStatus', label: '扫码状态' },
  { key: 'scanTime', label: '扫码时间' },
  { key: 'operatorName', label: '操作人' },
  { key: 'settlementAmount', label: '结算金额' },
  { key: 'isSettled', label: '结算状态' },
];
const PROCESS_TRACKING_COLUMN_GROUPS = [
  { title: '基本信息', keys: ['bundleNo', 'processName', 'color', 'size', 'quantity'] },
  { title: '扫码信息', keys: ['scanStatus', 'scanTime', 'operatorName'] },
  { title: '单价/结算', keys: ['unitPrice', 'settlementAmount', 'isSettled'] },
];
const PROCESS_TRACKING_DEFAULT_VISIBLE = Object.fromEntries(PROCESS_TRACKING_COLUMNS.map((c) => [c.key, true]));
const PROCESS_TRACKING_COLUMN_PRESETS = [
  {
    key: 'simple', label: '精简',
    values: { bundleNo: true, processName: true, size: true, quantity: true, scanStatus: true, isSettled: true },
  },
  { key: 'standard', label: '标准', values: PROCESS_TRACKING_DEFAULT_VISIBLE },
];

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
  onOpenInspectDrawer,
  factoryType,
}) => {
  const navigate = useNavigate();
  const [actioningRecordId, setActioningRecordId] = useState<string>('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchCompleting, setBatchCompleting] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

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

  const baseColumns = useProcessTrackingColumns({
    actioningRecordId,
    isAdmin: _isAdmin,
    orderStatus,
    orderNo,
    orderId,
    onManualComplete,
    onUndo: handleUndo,
  });

  const { extColumns } = useExtColumns<ProcessTrackingRecord>({ bizType: 'scan' });

  const columnSettings = useColumnSettings({
    pageKey: 'process-tracking-list',
    bizType: 'scan',
    allColumns: PROCESS_TRACKING_COLUMNS,
    defaultVisible: PROCESS_TRACKING_DEFAULT_VISIBLE,
  });

  const visibleBaseColumns = useMemo(
    () => baseColumns.filter((c: any) => columnSettings.visibleColumns[c.key] !== false),
    [baseColumns, columnSettings.visibleColumns],
  );

  const columns = useMemo(() => [...visibleBaseColumns, ...extColumns], [visibleBaseColumns, extColumns]);

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
    <>
    <div style={{ fontSize: 14 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filterType && (
            <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
              当前筛选：<strong style={{ color: 'var(--color-text-primary)' }}>{nodeName || filterType}</strong>
            </span>
          )}
          {isWarehousingType(filterType, nodeName) && orderId && factoryType !== 'EXTERNAL' && (
            <Space size="small">
              {onOpenInspectDrawer && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => onOpenInspectDrawer(orderId!)}
                  style={{ padding: 0, fontSize: 13 }}
                >
                  侧滑质检
                </Button>
              )}
              <Button
                type="link"
                size="small"
                icon={<SendOutlined />}
                onClick={() => navigate(paths.warehousingInspect.replace(':orderId', orderId!))}
                style={{ padding: 0, fontSize: 13 }}
              >
                跳转详情页
              </Button>
            </Space>
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
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            菲号: <strong>{stats.bundles}</strong> 个
          </span>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            工序: <strong>{stats.total}</strong> 条
          </span>
          <span style={{ fontSize: 14, color: 'var(--color-success)' }}>
            已扫: <strong>{stats.scanned}</strong> 条
          </span>
          <span style={{ fontSize: 14, color: 'var(--color-success)' }}>
            金额: <strong>{`¥${stats.totalAmount.toFixed(2)}`}</strong>
          </span>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => setColumnSettingsOpen(true)}
            style={{ padding: 0, fontSize: 13 }}
          >
            显示字段
          </Button>
        </Space>
      </div>

      <ResizableTable
        storageKey="process-tracking"
        columns={columns}
        dataSource={flatData}
        loading={loading}
        emptyDescription="暂无工序数据"
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

    <ColumnSettingsDrawer
      open={columnSettingsOpen}
      onClose={() => setColumnSettingsOpen(false)}
      columnOptions={PROCESS_TRACKING_COLUMNS}
      visibleColumns={columnSettings.visibleColumns}
      onToggle={columnSettings.setVisible}
      onReset={columnSettings.reset}
      title="显示字段"
      groups={PROCESS_TRACKING_COLUMN_GROUPS}
      presets={PROCESS_TRACKING_COLUMN_PRESETS}
      onApplyPreset={columnSettings.applyValues}
    />
    </>
  );
};

export default ProcessTrackingTable;
export type { ProcessTrackingTableProps, ProcessTrackingRecord } from './processTrackingFilter';
