/**
 * CuttingBundleTable - 裁剪扎号表格组件
 * 功能：显示订单的裁剪扎号明细
 */
import React from 'react';
import { Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { CuttingBundle } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';

interface CuttingBundleTableProps {
  data: CuttingBundle[];
  loading?: boolean;
  onBundleClick?: (bundle: CuttingBundle) => void;
}

const CuttingBundleTable: React.FC<CuttingBundleTableProps> = ({
  data,
  loading,
  onBundleClick,
}) => {
  const columns = [
    {
      title: '扎号',
      dataIndex: 'bundleNo',
      key: 'bundleNo',
      width: 100,
      render: (val: any, record: CuttingBundle) => (
        <a
          onClick={() => onBundleClick?.(record)}
          style={{ color: 'var(--primary-color)', cursor: 'pointer' }}
        >
          {val}
        </a>
      ),
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
      title: '当前进度',
      dataIndex: 'currentProgress',
      key: 'currentProgress',
      width: 120,
      render: (val: any, record: CuttingBundle) => {
        const progress = Number(val) || 0;
        const processName = record.currentProcessName || '-';
        return (
          <div>
            <div style={{ fontSize: "var(--font-size-xs)" }}>{processName as any}</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
              进度: {progress}%
            </div>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (val: any) => {
        const configs: Record<string, { text: string; color: string }> = {
          pending: { text: '待开始', color: 'default' },
          in_progress: { text: '进行中', color: 'processing' },
          completed: { text: '已完成', color: 'success' },
        };
        const config = configs[val] || { text: val, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '二维码',
      dataIndex: 'qrCode',
      key: 'qrCode',
      width: 150,
      ellipsis: true,
      render: (val: any) => (
        <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', fontFamily: 'monospace' }}>
          {val || '-'}
        </span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: (val: any) => formatDateTime(val),
    },
  ];

  return (
    <ResizableTable
      storageKey="cutting-bundle"
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

export default CuttingBundleTable;
