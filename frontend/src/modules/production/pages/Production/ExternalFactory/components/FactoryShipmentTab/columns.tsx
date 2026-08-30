import React from 'react';
import { Popconfirm, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FactoryShipment } from '@/types/production';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import DisplayStatusTag from '@/components/common/DisplayStatusTag';
import { displayDate } from '@/utils/display';
import type { ColumnHandlers } from './types';

/**
 * 构建发货记录表格列定义
 */
export function buildColumns(handlers: ColumnHandlers): ColumnsType<FactoryShipment> {
  const { onReceiveClick, onDelete, isFactoryAccount } = handlers;
  return [
    { title: '发货单号', dataIndex: 'shipmentNo', key: 'shipmentNo', width: 160 },
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 130 },
    { title: '工厂', dataIndex: 'factoryName', key: 'factoryName', width: 120 },
    { title: '发货数量', dataIndex: 'shipQuantity', key: 'shipQuantity', width: 100, align: 'right' },
    {
      title: '实际到货',
      dataIndex: 'receivedQuantity',
      key: 'receivedQuantity',
      width: 100,
      align: 'right',
      render: (val: number | undefined, record: FactoryShipment) => {
        const status = record.receiveStatus;
        if (status !== 'received' && status !== 'partial') return '-';
        const received = val != null ? val : record.shipQuantity;
        // D-242：分批收货时显示「已收 / 共发」，一眼看出还有多少在途
        if (status === 'partial') {
          return (
            <span style={{ color: 'var(--color-warning-deep)', fontWeight: 600 }}>
              {received} / {record.shipQuantity ?? 0}
            </span>
          );
        }
        return received;
      },
    },
    {
      title: '发货时间',
      dataIndex: 'shipTime',
      key: 'shipTime',
      width: 160,
      render: (val: string) => displayDate(val, 'datetime'),
    },
    {
      title: '发货方式',
      dataIndex: 'shipMethod',
      key: 'shipMethod',
      width: 100,
      render: (val: string) => (val === 'SELF_DELIVERY' ? <Tag color="green">自发货</Tag> : <Tag color="blue">快递</Tag>),
    },
    {
      title: '物流单号',
      dataIndex: 'trackingNo',
      key: 'trackingNo',
      width: 140,
      render: (val: string) => val || '-',
    },
    {
      title: '状态',
      dataIndex: 'receiveStatus',
      key: 'receiveStatus',
      width: 100,
      render: (val: string) => <DisplayStatusTag status={val} variant="shipment" />,
    },
    {
      title: '收货时间',
      dataIndex: 'receiveTime',
      key: 'receiveTime',
      width: 160,
      render: (val: string) => displayDate(val, 'datetime'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: FactoryShipment) => {
        // D-242：pending 与 partial 都可以继续收货（分批到货）
        // 外发工厂账号只能发货、不能收货（后端同样拦截，这里隐藏按钮避免误导）
        const status = record.receiveStatus;
        const canReceive = (status === 'pending' || status === 'partial') && !isFactoryAccount;
        // 已部分收货的发货单不允许删除，否则已收数量会凭空消失
        const canDelete = status === 'pending';
        const actions: RowAction[] = [
          ...(canReceive
            ? [{
                key: 'receive',
                label: status === 'partial' ? '继续收货' : '收货',
                primary: true,
                onClick: () => onReceiveClick(record),
              }]
            : []),
          ...(canDelete
            ? [{
                key: 'delete',
                label: (
                  <Popconfirm
                    title="确认删除此发货记录？"
                    onConfirm={() => onDelete(record)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <span style={{ color: 'var(--color-danger)' }}>删除</span>
                  </Popconfirm>
                ),
                danger: true,
              }]
            : []),
        ];
        if (actions.length === 0) return <Tag color="green">已完成</Tag>;
        return <RowActions actions={actions} />;
      },
    },
  ];
}
