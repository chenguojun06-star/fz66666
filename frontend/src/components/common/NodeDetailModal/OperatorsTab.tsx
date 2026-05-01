import React from 'react';
import { Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import type { OperatorSummary } from './types';

const { Text } = Typography;

const formatTime = (time?: string) => {
  if (!time) return '-';
  try {
    return new Date(time).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return time;
  }
};

const operatorColumns: ColumnsType<OperatorSummary> = [
  { title: '操作员', dataIndex: 'operatorName', ellipsis: true },
  { title: '完成数', dataIndex: 'totalQty', width: 70 },
  { title: '扫码次数', dataIndex: 'scanCount', width: 80 },
  { title: '最后操作', dataIndex: 'lastScanTime', width: 100, render: formatTime },
];

interface OperatorsTabProps {
  operatorSummary: OperatorSummary[];
}

const OperatorsTab: React.FC<OperatorsTabProps> = ({ operatorSummary }) => (
  <div style={{ padding: '8px 0' }}>
    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text type="secondary">共 {operatorSummary.length} 位操作员参与</Text>
      <Text type="secondary">
        总完成: {operatorSummary.reduce((s, o) => s + o.totalQty, 0)} 件
      </Text>
    </div>
    <ResizableTable
      storageKey="node-detail-operators"
      size="small"
      rowKey="operatorId"
      dataSource={operatorSummary}
      columns={operatorColumns}
      pagination={false}
    />
  </div>
);

export default OperatorsTab;
