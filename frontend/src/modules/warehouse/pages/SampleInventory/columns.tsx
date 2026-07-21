import React from 'react';
import { Image, Space, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import { SampleStock, SampleTypeMap } from './types';
import { InventoryStatusMap } from './helpers';

interface BuildColumnsOptions {
  onLoan: (record: SampleStock) => void;
  onTransfer: (record: SampleStock) => void;
  onHistory: (record: SampleStock) => void;
  onDestroy: (record: SampleStock) => void;
}

export const buildColumns = (options: BuildColumnsOptions): ColumnsType<SampleStock> => {
  const { onLoan, onTransfer, onHistory, onDestroy } = options;
  return [
    {
      title: '图片',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 72,
      align: 'center' as const,
      render: (text) => (
        <div style={{ width: 48, minHeight: 28, borderRadius: 4, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {text ? (
            <Image
              src={getFullAuthedFileUrl(text)}
              alt="样衣"
              width={48}
              style={{ height: 'auto', display: 'block' }}
              preview={false}
            />
          ) : (
            <span style={{ color: '#ccc', fontSize: 14, height: 48, display: 'flex', alignItems: 'center' }}>无图</span>
          )}
        </div>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '款式名称',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '类型',
      dataIndex: 'sampleType',
      key: 'sampleType',
      width: 100,
      render: (text) => <Tag>{SampleTypeMap[text] ?? '未知'}</Tag>,
    },
    {
      title: '颜色/尺码',
      key: 'spec',
      width: 150,
      render: (_, record) => `${record.color || '-'} / ${record.size || '-'}`,
    },
    {
      title: '库存概览',
      key: 'stock',
      width: 150,
      render: (_, record) => {
        const available = record.quantity - record.loanedQuantity;
        return (
          <Space>
            <Tooltip title="在库数量">
              <Tag color="green">{available}</Tag>
            </Tooltip>
            /
            <Tooltip title="总库存">
              <Tag>{record.quantity}</Tag>
            </Tooltip>
            {record.loanedQuantity > 0 && (
              <Tooltip title="借出数量">
                <Tag color="orange">借出: {record.loanedQuantity}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'inventoryStatus',
      key: 'inventoryStatus',
      width: 100,
      render: (text) => {
        const meta = InventoryStatusMap[String(text || 'active')] || InventoryStatusMap.active;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '样衣完成时间',
      dataIndex: 'sampleCompletedTime',
      key: 'sampleCompletedTime',
      width: 168,
      render: (text) => formatDateTime(text),
    },
    {
      title: '入库时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 168,
      render: (text) => formatDateTime(text),
    },
    {
      title: '最近更新时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 168,
      render: (text) => formatDateTime(text),
    },
    {
      title: '销毁时间',
      dataIndex: 'destroyTime',
      key: 'destroyTime',
      width: 168,
      render: (text) => formatDateTime(text),
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 220,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '销毁说明',
      dataIndex: 'destroyRemark',
      key: 'destroyRemark',
      width: 240,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          actions={
            record.inventoryStatus === 'destroyed'
              ? [
                  {
                    key: 'history',
                    label: '记录',
                    onClick: () => onHistory(record)
                  }
                ]
              : [
                  {
                    key: 'loan',
                    label: '借出',
                    disabled: record.quantity - record.loanedQuantity <= 0,
                    onClick: () => onLoan(record)
                  },
                  {
                    key: 'transfer',
                    label: '转成品出库',
                    disabled: record.inventoryStatus !== 'active' || record.quantity - record.loanedQuantity <= 0,
                    onClick: () => onTransfer(record),
                  },
                  {
                    key: 'history',
                    label: '记录',
                    onClick: () => onHistory(record)
                  },
                  {
                    key: 'destroy',
                    label: '销毁',
                    danger: true,
                    onClick: () => onDestroy(record),
                  }
                ]
          }
        />
      ),
    },
  ];
};
