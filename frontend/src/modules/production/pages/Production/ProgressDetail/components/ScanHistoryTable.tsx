/**
 * ScanHistoryTable - 扫码记录表格组件
 * 功能：显示订单的扫码历史记录，支持撤回操作
 */
import React, { useCallback, useMemo } from 'react';
import { Tag, App } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { ScanRecord } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import { productionScanApi } from '@/services/production/productionApi';

interface ScanHistoryTableProps {
  data: ScanRecord[];
  loading?: boolean;
  /** 订单状态（completed 时禁止撤回） */
  orderStatus?: string;
  /** 撤回成功后的回调（用于刷新数据） */
  onUndoSuccess?: () => void;
}

/** 扫码环节顺序：cutting→production→quality→warehouse */
const NEXT_STAGE: Record<string, string> = {
  cutting: 'production',
  production: 'quality',
  quality: 'warehouse',
};

/** 判断扫码记录是否可撤回 */
function canUndoRecord(record: ScanRecord, orderStatus?: string, allRecords?: ScanRecord[]): boolean {
  // 非成功记录不可撤回
  if (record.scanResult !== 'success') return false;
  // 已参与工资结算不可撤回
  if (record.payrollSettlementId) return false;
  // 订单已完成或已关闭不可撤回
  if (orderStatus) {
    const s = orderStatus.toLowerCase();
    if (s === 'completed' || s === 'closed') return false;
  }
  // 超过1小时不可撤回
  const scanTime = record.scanTime || record.createTime;
  if (scanTime) {
    const scanMs = new Date(String(scanTime).replace(' ', 'T')).getTime();
    if (!isNaN(scanMs) && Date.now() - scanMs >= 3600 * 1000) return false;
  }
  // 下一生产环节已有成功记录则不可撤回
  const nextType = NEXT_STAGE[record.scanType || ''];
  if (nextType && allRecords && record.cuttingBundleId) {
    const hasNext = allRecords.some(
      r => r.cuttingBundleId === record.cuttingBundleId &&
           r.scanType === nextType &&
           r.scanResult === 'success'
    );
    if (hasNext) return false;
  }
  return true;
}

const ScanHistoryTable: React.FC<ScanHistoryTableProps> = ({ data, loading, orderStatus, onUndoSuccess }) => {
  const { message, modal } = App.useApp();

  const handleUndo = useCallback(async (record: ScanRecord) => {
    modal.confirm({
      title: '确认撤回',
      content: `确定撤回此扫码记录？\n工序: ${record.progressStage || record.processName || '-'}\n扎号: ${record.cuttingBundleNo || '-'}\n数量: ${record.quantity || 0}件`,
      okText: '确认撤回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await productionScanApi.undo({ recordId: record.id! });
          message.success('撤回成功');
          onUndoSuccess?.();
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '撤回失败');
        }
      },
    });
  }, [message, modal, onUndoSuccess]);

  const columns = useMemo(() => [
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 170,
      render: (val: any) => formatDateTime(val),
    },
    {
      title: '工序',
      dataIndex: 'progressStage',
      key: 'progressStage',
      width: 120,
      render: (val: any, record: ScanRecord) => val || record.processName || '-',
    },
    {
      title: '扎号',
      dataIndex: 'bundleNo',
      key: 'bundleNo',
      width: 100,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 60,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
      render: (val: any) => Number(val) || 0,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
    },
    {
      title: '结果',
      dataIndex: 'scanResult',
      key: 'scanResult',
      width: 80,
      render: (val: any) => {
        if (val === 'success') return <Tag color="success">成功</Tag>;
        if (val === 'failure') return <Tag color="error">失败</Tag>;
        return <Tag>{val || '-'}</Tag>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: ScanRecord) => {
        if (!canUndoRecord(record, orderStatus, data)) return null;
        const actions: RowAction[] = [
          {
            key: 'undo',
            label: '撤回',
            danger: true,
            primary: true,
            onClick: () => handleUndo(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ], [orderStatus, handleUndo]);

  return (
    <ResizableTable
      storageKey="scan-history"
      dataSource={data}
      columns={columns}
      rowKey="id"
      size="small"
      loading={loading}
      pagination={false}
      scroll={{ y: 400 }}
    />
  );
};

export default ScanHistoryTable;
