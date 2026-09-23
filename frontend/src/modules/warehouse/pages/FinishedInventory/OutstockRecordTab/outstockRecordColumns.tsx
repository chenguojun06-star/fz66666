import React from 'react';
import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { styleImageColumn } from '@/components/common/styleImageColumns';
import type { StyleImageMap } from '@/hooks/useStyleCoverImages';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { getPlatformTag } from '@/utils/platform';
import type { GroupedOutstock, OutstockRecord } from './outstockRecordTypes';
import { outstockTypeMap, isReturnedTransferLine } from './outstockRecordTypes';

export type { OutstockRecord } from './outstockRecordTypes';

/** D-437：审核状态统一渲染——returned=全部明细已回入库的调拨单 */
function ApprovalTag({ status }: { status: GroupedOutstock['status'] }) {
  if (status === 'returned') return <Tag color="cyan">已回入库</Tag>;
  if (status === 'approved') return <Tag color="green">已审核</Tag>;
  return <Tag color="orange">待审核</Tag>;
}

/**
 * D-437：出库记录主表 = 一行一张出库单（按 outstockNo 聚合）。
 * 点单号/明细 → 查看该单全部明细；审核/打印按单操作。
 */
export function getGroupedOutstockColumns(handlers: {
  handleOpenDetail: (group: GroupedOutstock) => void;
  handleApproveGroup: (group: GroupedOutstock) => void;
  handleShare: (group: GroupedOutstock) => void;
  handleLog: (group: GroupedOutstock) => void;
  handlePrint: (group: GroupedOutstock) => void;
}, appearance?: { imageMap?: StyleImageMap }): ColumnsType<GroupedOutstock> {
  const imageMap = appearance?.imageMap ?? {};
  return [
    {
      title: '出库单号',
      dataIndex: 'outstockNo',
      width: 170,
      render: (text: string, group) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 600, height: 'auto' }}
          onClick={() => handlers.handleOpenDetail(group)}
        >
          {text}
        </Button>
      ),
    },
    // 款式图：一行一张出库单，取单内第一个明细行的商品编码出图
    styleImageColumn<GroupedOutstock>({
      imageMap,
      skuCode: (g) => g.lines[0]?.skuCode,
      styleNo: (g) => g.lines[0]?.styleNo,
    }),
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
      title: '款式 / 明细',
      key: 'styles',
      width: 220,
      render: (_, group) => (
        <div>
          <div className="u-fw-600">
            {group.styleNos[0] || '-'}
            {group.styleNos.length > 1 ? <Tag color="purple" style={{ marginLeft: 6 }}>混{group.styleNos.length}款</Tag> : null}
          </div>
          <div className="u-fs-12" style={{ color: 'var(--neutral-text-disabled)' }}>
            {group.styleNames[0] || ''} · 共 {group.skuCount} 个商品编码
          </div>
        </div>
      ),
    },
    {
      title: '出库数量',
      key: 'totalQuantity',
      width: 100,
      align: 'center',
      render: (_, group) => (
        <strong style={{ color: 'var(--primary-color)', fontSize: 'var(--font-size-md)' }}>{group.totalQuantity}</strong>
      ),
    },
    {
      title: '出库金额',
      key: 'totalAmount',
      width: 110,
      align: 'right',
      render: (_, group) => group.totalAmount != null ? (
        <span className="u-fw-600" style={{ color: 'var(--color-error)' }}>{formatMoney(Number(group.totalAmount))}</span>
      ) : '-',
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
      render: (_, group) => {
        if (!group.trackingNo && !group.expressCompany) {
          return <span style={{ color: 'var(--neutral-text-disabled)' }}>未填写</span>;
        }
        return (
          <div className="u-fs-12">
            {group.expressCompany && <div>快递: <Tag>{group.expressCompany}</Tag></div>}
            {group.trackingNo && <div>单号: <span style={{ color: 'var(--primary-color)' }}>{group.trackingNo}</span></div>}
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
      title: '审核状态',
      key: 'approvalStatus',
      width: 100,
      align: 'center',
      render: (_, group) => <ApprovalTag status={group.status} />,
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
      width: 180,
      fixed: 'right' as const,
      render: (_, group) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '明细', primary: true, onClick: () => handlers.handleOpenDetail(group) },
        ];
        if (group.status === 'pending') {
          actions.push({ key: 'approve', label: '审核', onClick: () => handlers.handleApproveGroup(group) });
        }
        actions.push(
          { key: 'print', label: '打印', onClick: () => handlers.handlePrint(group) },
          { key: 'share', label: '分享', onClick: () => handlers.handleShare(group) },
          { key: 'log', label: '日志', onClick: () => handlers.handleLog(group) },
        );
        return <RowActions actions={actions} />;
      },
    },
  ];
}

/** 出库单明细行（详情抽屉内）：一码一行 + 回入库入口 */
export function getOutstockLineColumns(handlers: {
  handleTransferInbound?: (record: OutstockRecord) => void;
}, appearance?: { imageMap?: StyleImageMap }): ColumnsType<OutstockRecord> {
  const imageMap = appearance?.imageMap ?? {};
  return [
    // 款式图：出库单明细以前只有编码/款号文字，打印/核对时看不出是哪件货
    styleImageColumn<OutstockRecord>({
      imageMap,
      skuCode: (r) => r.skuCode,
      styleNo: (r) => r.styleNo,
    }),
    {
      title: '商品编码',
      dataIndex: 'skuCode',
      width: 200,
      render: (text) => <span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{text || '-'}</span>,
    },
    {
      title: '款号 / 款名',
      width: 190,
      render: (_, record) => (
        <div>
          <div className="u-fw-600">{record.styleNo || '-'}</div>
          <div className="u-fs-12" style={{ color: 'var(--neutral-text-disabled)' }}>{record.styleName || ''}</div>
        </div>
      ),
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
      render: (val) => <strong style={{ color: 'var(--primary-color)' }}>{val ?? 0}</strong>,
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      width: 100,
      align: 'center' as const,
      render: (val: number) => <span className="u-fw-600" style={{ color: 'var(--color-error)' }}>{formatMoney(Number(val) || 0)}</span>,
    },
    {
      title: '出库金额',
      dataIndex: 'totalAmount',
      width: 110,
      align: 'right',
      render: (val) => val != null ? formatMoney(Number(val)) : '-',
    },
    {
      title: '状态',
      key: 'lineStatus',
      width: 100,
      align: 'center',
      render: (_, record) => {
        if (isReturnedTransferLine(record)) return <Tag color="cyan">已回入库</Tag>;
        return record.approvalStatus === 'approved' ? <Tag color="green">已审核</Tag> : <Tag color="orange">待审核</Tag>;
      },
    },
    {
      title: '操作',
      key: 'lineActions',
      width: 100,
      render: (_, record) => {
        if (handlers.handleTransferInbound
          && record.outstockType === 'transfer_out'
          && record.transferInboundStatus !== 'INBOUND') {
          return <Button size="small" type="link" style={{ padding: 0 }} onClick={() => handlers.handleTransferInbound!(record)}>回入库</Button>;
        }
        return null;
      },
    },
  ];
}
