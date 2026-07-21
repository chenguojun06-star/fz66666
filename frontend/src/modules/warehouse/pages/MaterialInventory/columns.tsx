import React from 'react';
import { Button, Tag, Space, Popconfirm } from 'antd';
import { formatDateTime } from '@/utils/datetime';
import type { PickingRow } from './hooks/useMaterialPickupData';
import { STATUS_MAP, USAGE_TYPE_MAP } from './constants';

/**
 * 领料记录表格所需的外部动作集合
 * 由 index.tsx 从 useMaterialPickupData 解构后传入
 */
export interface PickingActions {
  handlePrint: (record: PickingRow) => void;
  confirmingId: string | null;
  handleConfirmOutbound: (record: PickingRow) => Promise<void>;
  cancellingId: string | null;
  handleCancelPending: (record: PickingRow) => Promise<void>;
  auditingId: string | null;
  handleAudit: (id: string, action: 'approve' | 'reject', remark?: string) => Promise<void>;
}

/**
 * 构建领料记录主表列定义
 * 与原 index.tsx 内联实现完全一致，仅抽出为独立函数
 */
export function buildPickingColumns(actions: PickingActions) {
  const {
    handlePrint,
    confirmingId,
    handleConfirmOutbound,
    cancellingId,
    handleCancelPending,
    auditingId,
    handleAudit,
  } = actions;

  return [
    { title: '领料单号', dataIndex: 'pickingNo', width: 180 },
    { title: '订单号', dataIndex: 'orderNo', width: 160 },
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      width: 200,
      render: (value: string, record: PickingRow) => {
        const text = value || '-';
        const factoryTypeTag = record.factoryType === 'EXTERNAL'
          ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>外部</Tag>
          : record.factoryType === 'INTERNAL'
            ? <Tag color="green" style={{ marginInlineEnd: 0 }}>内部</Tag>
            : null;
        return <Space size={[6, 6]} wrap><span>{text}</span>{factoryTypeTag}</Space>;
      },
    },
    { title: '领取人', dataIndex: 'pickerName', width: 100 },
    {
      title: '领取类型',
      dataIndex: 'pickupType',
      width: 90,
      render: (v: string) => v === 'EXTERNAL' ? <Tag color="blue">外部</Tag> : <Tag color="green">内部</Tag>,
    },
    {
      title: '用料场景',
      dataIndex: 'usageType',
      width: 110,
      render: (v: string) => {
        const matched = USAGE_TYPE_MAP[v];
        return matched ? <Tag color={matched.color}>{matched.text}</Tag> : (v ? '未知' : '-');
      },
    },
    {
      title: '申请时间',
      dataIndex: 'createTime',
      width: 150,
      render: (t: string) => formatDateTime(t),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] || { text: s ? '未知' : '-', color: 'default' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '审核状态',
      dataIndex: 'auditStatus',
      width: 100,
      render: (status: string, record: PickingRow) => {
        if (record.status !== 'completed') return '-';
        if (status === 'APPROVED') return <Tag color="green">已审核</Tag>;
        if (status === 'REJECTED') return <Tag color="red">已拒绝</Tag>;
        return <Tag color="orange">待审核</Tag>;
      },
    },
    {
      title: '财务状态',
      dataIndex: 'financeStatus',
      width: 100,
      render: (status: string, record: PickingRow) => {
        if (record.status !== 'completed') return '-';
        if (record.auditStatus !== 'APPROVED') return '-';
        if (status === 'SETTLED') return <Tag color="green">已平账</Tag>;
        if (status === 'PENDING') return <Tag color="orange">待结算</Tag>;
        return <Tag color="default">未知</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_: unknown, record: PickingRow) => {
        const acts: React.ReactNode[] = [];
        acts.push(
          <Button key="print" onClick={() => handlePrint(record)}>
            打印
          </Button>
        );
        if (record.status === 'pending') {
          acts.push(
            <Popconfirm
              key="confirm"
              title="确认出库"
              description="确认后将实际扣减库存，不可撤销。"
              onConfirm={() => void handleConfirmOutbound(record)}
              okText="出库"
              cancelText="取消"
            >
              <Button type="primary" loading={confirmingId === record.id}>
                出库
              </Button>
            </Popconfirm>
          );
          acts.push(
            <Popconfirm
              key="cancel"
              title="取消领料"
              description="确认后将取消本次领料申请，释放锁定库存。"
              onConfirm={() => void handleCancelPending(record)}
              okText="确认取消"
              cancelText="再想想"
              okButtonProps={{ danger: true }}
            >
              <Button danger loading={cancellingId === record.id}>
                取消
              </Button>
            </Popconfirm>
          );
        }
        if (record.status === 'completed' && !record.auditStatus) {
          acts.push(
            <Popconfirm
              key="audit"
              title="审核确认"
              description={record.factoryType === 'EXTERNAL'
                ? '审核通过后将自动生成外发工厂应收账单。'
                : '审核通过后将做内部平账处理。'}
              onConfirm={() => void handleAudit(record.id, 'approve',
                record.factoryType === 'EXTERNAL' ? '外发工厂领料审核通过' : '内部领料审核通过')}
              okText="审核通过"
              cancelText="取消"
            >
              <Button type="primary" loading={auditingId === record.id}>
                审核
              </Button>
            </Popconfirm>
          );
        }
        return <Space size={6}>{acts}</Space>;
      },
    },
  ];
}

/**
 * 构建领料展开行内的物料明细列定义
 * @param canSeePrice 当前用户是否可查看价格
 */
export function buildItemColumns(canSeePrice: boolean) {
  return [
    { title: '物料编号', dataIndex: 'materialCode', width: 140 },
    { title: '物料名称', dataIndex: 'materialName', width: 160 },
    { title: '颜色', dataIndex: 'color', width: 80 },
    {
      title: '规格/幅宽', dataIndex: 'specification', width: 120,
      render: (_: any, row: any) => row.specification || row.size || '-',
    },
    { title: '供应商', dataIndex: 'supplierName', width: 120 },
    { title: '库位', dataIndex: 'warehouseLocation', width: 100 },
    {
      title: '出库数量', dataIndex: 'quantity', width: 100,
      render: (qty: number, row: any) => `${qty} ${row.unit || '件'}`,
    },
    {
      title: '单价', dataIndex: 'unitPrice', width: 80,
      render: (val: number) => canSeePrice && val != null ? val.toFixed(2) : (canSeePrice ? '-' : '***'),
    },
    {
      title: '出库金额', dataIndex: 'outboundAmount', width: 110,
      align: 'right' as const,
      render: (_: any, row: any) => {
        if (!canSeePrice) return '***';
        const qty = Number(row.quantity || 0);
        const price = Number(row.unitPrice || 0);
        if (!qty || !price) return '-';
        return `¥${(qty * price).toFixed(2)}`;
      },
    },
  ];
}
