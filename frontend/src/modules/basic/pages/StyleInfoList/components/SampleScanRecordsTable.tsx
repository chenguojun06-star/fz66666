import React, { useEffect, useMemo, useState } from 'react';
import { Table, Skeleton, Button, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import useSampleScanRecords, { ScanRecord } from './useSampleScanRecords';

interface SampleScanRecordsTableProps {
  patternId: string;
  stageKey?: string;
  onRefresh?: () => void;
}

const OPERATION_TYPE_LABELS: Record<string, string> = {
  RECEIVE: '领取样板',
  PLATE: '车板',
  FOLLOW_UP: '跟单',
  COMPLETE: '完成确认',
  PROCUREMENT: '采购',
  CUTTING: '裁剪',
  SECONDARY: '二次工艺',
  SEWING: '车缝',
  TAIL: '尾部',
  REVIEW: '审核',
  WAREHOUSE_IN: '入库',
  WAREHOUSE_OUT: '出库',
  WAREHOUSE_RETURN: '归还',
  REWORK: '返修完成',
};

function getOperationLabel(op: string | undefined): string {
  if (!op) return '-';
  return OPERATION_TYPE_LABELS[op.toUpperCase()] ?? '未知';
}

const SampleScanRecordsTable: React.FC<SampleScanRecordsTableProps> = ({ patternId, stageKey, onRefresh }) => {
  const { message } = App.useApp();
  const { scanRecords, scanRecordsLoading, loadScanRecords, getFilteredRecords, undoScanRecord } = useSampleScanRecords();
  const [undoingIds, setUndoingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (patternId) {
      void loadScanRecords(patternId);
    }
  }, [patternId, loadScanRecords]);

  const filteredRecords = useMemo(() => getFilteredRecords(stageKey), [getFilteredRecords, stageKey]);

  const canUndo = (record: ScanRecord) => {
    if (!record.scanTime) return false;
    const elapsed = Date.now() - new Date(record.scanTime).getTime();
    return elapsed < 30 * 60 * 1000;
  };

  const handleUndo = async (record: ScanRecord) => {
    if (undoingIds.has(record.id)) return;
    setUndoingIds(prev => new Set(prev).add(record.id));
    try {
      await undoScanRecord(record.patternProductionId, record.id);
      message.success('已撤销');
      onRefresh?.();
    } catch (err: any) {
      message.error(typeof err?.response?.data?.message === 'string' ? err.response.data.message : '撤销失败');
    } finally {
      setUndoingIds(prev => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const columns: ColumnsType<ScanRecord> = [
    {
      title: '工序/操作',
      key: 'operation',
      width: 160,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{getOperationLabel(record.operationType)}</div>
          {record.processName && record.operationType !== record.processName?.toUpperCase() ? (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {record.processName}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '操作人',
      key: 'operator',
      width: 110,
      render: (_, record) => (
        <div>
          <div>{record.operatorName || record.operatorId || '-'}</div>
          {record.operatorRole && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {record.operatorRole === 'QUALITY' ? '质检' : record.operatorRole === 'TAILOR' ? '裁缝' : record.operatorRole}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 170,
    },
    {
      title: '仓库',
      dataIndex: 'warehouseCode',
      key: 'warehouseCode',
      width: 100,
      render: (text) => text ? <span style={{ fontFamily: 'monospace' }}>{text}</span> : '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (text) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        canUndo(record) ? (
          <Button
            type="link"
            danger
            size="small"
            loading={undoingIds.has(record.id)}
            onClick={() => handleUndo(record)}
          >
            撤回
          </Button>
        ) : null
      ),
    },
  ];

  if (scanRecordsLoading) {
    return <Skeleton active paragraph={{ rows: 3 }} />;
  }

  if (filteredRecords.length === 0) {
    return (
      <div style={{
        padding: '24px 0',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        fontSize: '13px',
      }}>
        暂无扫码记录
      </div>
    );
  }

  return (
    <Table<ScanRecord>
      columns={columns}
      dataSource={filteredRecords}
      rowKey="id"
      size="small"
      pagination={filteredRecords.length > 10 ? { pageSize: 10, size: 'small' } : false}
      scroll={{ y: 280 }}
    />
  );
};

export default SampleScanRecordsTable;
