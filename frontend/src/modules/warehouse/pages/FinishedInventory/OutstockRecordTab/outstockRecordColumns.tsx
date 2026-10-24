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
function ApprovalTag({ status, onApprove }: { status: GroupedOutstock['status']; onApprove?: () => void }) {
  if (status === 'returned') return <Tag color="cyan">已回入库</Tag>;
  if (status === 'approved') return <Tag color="green">已审核</Tag>;
  // D-866：单条审核入口从「更多」二级菜单里提到状态列旁——出库记录是每天要对的账，
  // 待审核就应当能一键处理（点击仍走 Modal.confirm，不会误触）
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <Tag color="orange">待审核</Tag>
      {onApprove ? (
        <Button
          type="link"
          size="small"
          style={{ padding: '0 0 0 2px', height: 'auto' }}
          onClick={onApprove}
        >
          审核
        </Button>
      ) : null}
    </span>
  );
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
          {/* D-529：套装出库——显示所属组合商品 */}
          {group.comboCodes.length > 0 ? (
            <div className="u-fs-12 u-mt-4">
              <Tag color="geekblue" style={{ margin: 0 }}>套装 {group.comboCodes.join('、')}</Tag>
            </div>
          ) : null}
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
      render: (text: string, group: GroupedOutstock) => text || (
        <span style={{ color: 'var(--neutral-text-disabled)' }}>
          {group.platformCode === 'POS' ? '散客' : '未填写'}
        </span>
      ),
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
          // D-862：POS 零售是门店自提，本来就没有物流；显示「未填写」会被误读为漏填
          return (
            <span style={{ color: 'var(--neutral-text-disabled)' }}>
              {group.platformCode === 'POS' ? '门店自提' : '未填写'}
            </span>
          );
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
      key: 'orderNo',
      width: 170,
      // D-862：POS/店铺出库的 order_no 是 POS/店铺单号，此前只读 productionOrderNo → 一律显示「-」，
      // 用户看不出这批货来自哪笔销售。
      render: (_, group) => group.orderNo || group.productionOrderNo || '-',
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
      render: (_, group) => (
        <ApprovalTag
          status={group.status}
          onApprove={group.status === 'pending' ? () => handlers.handleApproveGroup(group) : undefined}
        />
      ),
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
      // D-529：套装出库的明细行标注所属组合商品（销售关联组合SKU，库存按子SKU扣）
      title: '套装',
      dataIndex: 'comboName',
      width: 140,
      render: (_, record) => record.comboCode ? (
        <Tag color="geekblue" style={{ margin: 0 }} title={`${record.comboName || ''}(${record.comboCode})`}>
          {record.comboName || record.comboCode}
        </Tag>
      ) : '-',
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
      // D-533：套装出库行单价=套装单价，子SKU原售价留痕仅供参考
      title: '子SKU原价',
      dataIndex: 'originalSalesPrice',
      width: 100,
      align: 'center' as const,
      render: (val: number | null | undefined) => val != null
        ? <span style={{ color: 'var(--color-text-tertiary)', textDecoration: 'line-through' }}>{formatMoney(Number(val))}</span>
        : <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>,
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
