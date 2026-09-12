import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { getPlatformTag } from '@/utils/platform';
import type { OutstockRecord } from './outstockRecordTypes';
import { outstockTypeMap } from './outstockRecordTypes';

export type { OutstockRecord } from './outstockRecordTypes';

export function getOutstockRecordColumns(handlers: {
  handleApprove: (id: number) => void;
  handleShare: (record: OutstockRecord) => void;
  handleTransferInbound?: (record: OutstockRecord) => void;
  handleLog?: (record: OutstockRecord) => void;
  handlePrint?: (record: OutstockRecord) => void;
}): ColumnsType<OutstockRecord> {
  return [
    {
      title: '出库单号',
      dataIndex: 'outstockNo',
      width: 160,
      render: (text) => (
        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{text}</span>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platformCode',
      width: 80,
      render: (code: string) => {
        if (!code) return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
        const t = getPlatformTag(code);
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '款号 / 款名',
      width: 180,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.styleNo || '-'}</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)' }}>
            {record.styleName || ''}
          </div>
        </div>
      ),
    },
    {
      title: '商品编码',
      dataIndex: 'skuCode',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 90,
      render: (text) => text ? <Tag color="blue">{text}</Tag> : '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      width: 80,
      render: (text) => text ? <Tag color="green">{text}</Tag> : '-',
    },
    {
      title: '出库数量',
      dataIndex: 'outstockQuantity',
      width: 100,
      align: 'center',
      render: (val) => (
        <strong style={{ color: 'var(--primary-color)', fontSize: 'var(--font-size-md)' }}>
          {val ?? 0}
        </strong>
      ),
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      width: 100,
      align: 'center' as const,
      render: (val: number) => {
        const sale = Number(val) || 0;
        return <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{formatMoney(sale)}</span>;
      },
    },
    {
      title: '客户名称',
      dataIndex: 'customerName',
      width: 120,
      render: (text) => text || <span style={{ color: 'var(--neutral-text-disabled)' }}>未填写</span>,
    },
    {
      title: '联系电话',
      dataIndex: 'customerPhone',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '出库金额',
      dataIndex: 'totalAmount',
      width: 110,
      align: 'right',
      render: (val) => val != null ? (
        <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{formatMoney(Number(val))}</span>
      ) : '-',
    },
    {
      title: '已收金额',
      dataIndex: 'paidAmount',
      width: 110,
      align: 'right',
      render: (val) => val != null ? (
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{formatMoney(Number(val))}</span>
      ) : '-',
    },
    {
      title: '收款状态',
      dataIndex: 'paymentStatus',
      width: 100,
      align: 'center',
      render: (text) => {
        const map: Record<string, { label: string; color: string }> = {
          unpaid: { label: '未收款', color: 'orange' },
          partial: { label: '部分收款', color: 'blue' },
          paid: { label: '已收款', color: 'green' },
        };
        const info = map[text] || { label: text || '-', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '物流信息',
      width: 180,
      render: (_, record) => {
        if (!record.trackingNo && !record.expressCompany) {
          return <span style={{ color: 'var(--neutral-text-disabled)' }}>未填写</span>;
        }
        return (
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            {record.expressCompany && <div>快递: <Tag>{record.expressCompany}</Tag></div>}
            {record.trackingNo && <div>单号: <span style={{ color: 'var(--primary-color)' }}>{record.trackingNo}</span></div>}
          </div>
        );
      },
    },
    {
      title: '出库类型',
      dataIndex: 'outstockType',
      width: 100,
      align: 'center',
      render: (text) => {
        const info = outstockTypeMap[text] || { label: text || '普通出库', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '关联订单',
      dataIndex: 'productionOrderNo',
      width: 140,
      render: (text) => text || '-',
    },
    {
      title: '操作人',
      dataIndex: 'creatorName',
      width: 90,
    },
    {
      title: '结算时间',
      dataIndex: 'settlementTime',
      width: 160,
      render: (text) => text ? formatDateTime(text) : '-',
    },
    {
      title: '审核状态',
      dataIndex: 'approvalStatus',
      width: 100,
      align: 'center',
      render: (text, record) => {
        // D-363g：已回入库的调拨出库终态展示——不参与审核与结算
        if (record.outstockType === 'transfer_out' && record.transferInboundStatus === 'INBOUND') {
          return <Tag color="cyan">已回入库</Tag>;
        }
        return text === 'approved'
          ? <Tag color="green">已审核</Tag>
          : <Tag color="orange">待审核</Tag>;
      },
    },
    {
      title: '出库时间',
      dataIndex: 'createTime',
      width: 160,
      render: (text) => text ? formatDateTime(text) : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => {
        const actions: RowAction[] = [];
        // D-363g：已回入库的调拨出库不可审核（货已回仓，不推结算）
        const returnedTransfer = record.outstockType === 'transfer_out' && record.transferInboundStatus === 'INBOUND';
        if (record.approvalStatus !== 'approved' && !returnedTransfer) {
          actions.push({
            key: 'approve',
            label: '审核',
            primary: true,
            onClick: () => handlers.handleApprove(record.id),
          });
        }
        // D-360n：调拨出库且未回入 → 提供「回入库」（调入方确认收货）
        if (handlers.handleTransferInbound
          && record.outstockType === 'transfer_out'
          && record.transferInboundStatus !== 'INBOUND') {
          actions.push({
            key: 'transfer-inbound',
            label: '回入库',
            onClick: () => handlers.handleTransferInbound!(record),
          });
        }
        actions.push({
          key: 'share',
          label: '分享',
          onClick: () => handlers.handleShare(record),
        });
        if (handlers.handleLog) {
          actions.push({
            key: 'log',
            label: '日志',
            onClick: () => handlers.handleLog!(record),
          });
        }
        if (handlers.handlePrint) {
          actions.push({
            key: 'print',
            label: '打印',
            // D-363h：整单打印——同一出库单号的全部明细（多码数/多款）打在一张纸上
            onClick: () => handlers.handlePrint!(record),
          });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];
}
