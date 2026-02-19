import React from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { OperationHistoryRow } from '@/utils/operationHistory';

export type { OperationHistoryRow };

interface OperationHistoryTableProps {
  rows: OperationHistoryRow[];
  emptyText?: string;
  renderOperator?: (row: OperationHistoryRow) => React.ReactNode;
}

const OperationHistoryTable: React.FC<OperationHistoryTableProps> = ({
  rows,
  emptyText = '暂无记录',
  renderOperator,
}) => {
  const columns: ColumnsType<OperationHistoryRow> = [
    { title: '类型', dataIndex: 'type', key: 'type', width: 70 },
    { title: '父节点', dataIndex: 'stageName', key: 'stageName', width: 90 },
    { title: '子工序', dataIndex: 'processName', key: 'processName', render: (val) => val || '-' },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 120,
      render: (_, record) => (renderOperator ? renderOperator(record) : (record.operatorName || '-')),
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' },
    { title: '时间', dataIndex: 'time', key: 'time', width: 140 },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (val) => val || '-' },
  ];

  return (
    <ResizableTable
      storageKey="operation-history"
      dataSource={rows}
      columns={columns}
      rowKey={(_, idx) => `${_?.type}_${idx}`}
      size="small"
      pagination={false}
      locale={{ emptyText }}
      bordered
    />
  );
};

export default OperationHistoryTable;
