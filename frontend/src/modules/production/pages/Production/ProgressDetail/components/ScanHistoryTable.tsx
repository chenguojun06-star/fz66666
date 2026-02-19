/**
 * ScanHistoryTable - 扫码记录表格组件
 * 功能：显示订单的扫码历史记录
 */
import React from 'react';
import { Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { ScanRecord } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';

interface ScanHistoryTableProps {
  data: ScanRecord[];
  loading?: boolean;
}

const ScanHistoryTable: React.FC<ScanHistoryTableProps> = ({ data, loading }) => {
  const columns = [
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
      render: (val: any) => val || '-',
    },
  ];

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
