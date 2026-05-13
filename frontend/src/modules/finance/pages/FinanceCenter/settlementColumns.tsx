import React from 'react';
import { Tooltip, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import RowActions from '@/components/common/RowActions';
import styles from './FinishedSettlementContent.module.css';
import { type FinishedSettlementRow, statusMap } from './useSettlementData';

export function getSettlementColumns(
  auditedOrderNos: Set<string>,
  handleAuditOrder: (record: FinishedSettlementRow) => void,
  openRemarkModal: (record: FinishedSettlementRow) => void,
  openLogModal: (orderId: string) => void,
): ColumnsType<FinishedSettlementRow> {
  return [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
      render: (text: string) => <span className={styles.orderNo}>{text}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 220,
      render: (_text, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {record.factoryType === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
            {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
            <span>{record.factoryName || '-'}</span>
          </div>
          {(record.orgPath || record.parentOrgUnitName) &&
           (record.orgPath || record.parentOrgUnitName) !== record.factoryName ? (
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
              {record.orgPath || record.parentOrgUnitName}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusInfo = statusMap[status] || { text: '未知', color: 'var(--neutral-text-secondary)' };
        return (
          <span style={{ padding: '2px 8px', fontSize: '12px', backgroundColor: `${statusInfo.color}15`, color: statusInfo.color, fontWeight: 500 }}>
            {statusInfo.text}
          </span>
        );
      },
    },
    {
      title: '完成时间',
      dataIndex: 'completeTime',
      key: 'completeTime',
      width: 160,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-',
    },
    { title: '颜色', dataIndex: 'colors', key: 'colors', width: 100 },
    {
      title: '下单数',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '-',
    },
    {
      title: '入库数',
      dataIndex: 'warehousedQuantity',
      key: 'warehousedQuantity',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '-',
    },
    {
      title: '次品数',
      dataIndex: 'defectQuantity',
      key: 'defectQuantity',
      width: 100,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 0 ? 'var(--color-danger)' : '#666' }}>
          {val?.toLocaleString() || '-'}
        </span>
      ),
    },
    {
      title: (<Tooltip title="下单时锁定的加工单价"><span>下单锁定单价</span></Tooltip>),
      dataIndex: 'styleFinalPrice',
      key: 'styleFinalPrice',
      width: 150,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{val?.toFixed(2) || '0.00'}</span>
      ),
    },
    {
      title: (<Tooltip title="面辅料采购总成本（状态：已收货/已完成）"><span>面辅料成本</span></Tooltip>),
      dataIndex: 'materialCost',
      key: 'materialCost',
      width: 130,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: (<Tooltip title="生产过程中工序扫码成本总计（生产工序单价之和）"><span>生产成本</span></Tooltip>),
      dataIndex: 'productionCost',
      key: 'productionCost',
      width: 120,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: (<Tooltip title="次品报废损失 = 次品数 × 单件成本（面辅料+生产）"><span>报废损失</span></Tooltip>),
      dataIndex: 'defectLoss',
      key: 'defectLoss',
      width: 120,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 0 ? 'var(--color-danger)' : 'var(--neutral-text-secondary)' }}>
          {val > 0 ? '-' : ''}¥{val?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 130,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{val?.toFixed(2) || '0.00'}</span>
      ),
    },
    {
      title: '利润',
      dataIndex: 'profit',
      key: 'profit',
      width: 130,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
          ¥{val?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: '利润率',
      dataIndex: 'profitMargin',
      key: 'profitMargin',
      width: 100,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {val !== null && val !== undefined ? `${val.toFixed(2)}%` : '-'}
        </span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: { showTitle: false },
      render: (text: string | undefined) => (
        <Tooltip title={text || '暂无备注'}>
          <span style={{ cursor: 'pointer', color: text ? 'var(--primary-color)' : 'var(--neutral-text-disabled)' }}>
            {text || '暂无'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, record: FinishedSettlementRow) => {
        const isInternalFactory = record.factoryType === 'INTERNAL';
        const isAudited = auditedOrderNos.has(record.orderNo) || record.approvalStatus === 'APPROVED';
        const hasWarehousedQty = (record.warehousedQuantity ?? 0) > 0;
        const canAudit = !isInternalFactory && isOrderFrozenByStatus(record) && hasWarehousedQty && !isAudited;
        const isCancelled = ['CANCELLED', 'cancelled', 'DELETED', 'deleted', 'scrapped', '废弃', '已取消'].includes(record.status || '');
        return (
          <RowActions
            actions={[
              { key: 'approve', label: isAudited ? '已审核' : '审核', primary: canAudit, disabled: isInternalFactory || isCancelled || isAudited || !isOrderFrozenByStatus(record) || !hasWarehousedQty, onClick: () => handleAuditOrder(record) },
              { key: 'remark', label: '备注', onClick: () => openRemarkModal(record) },
              { key: 'log', label: '日志', onClick: () => openLogModal(record.orderId) },
            ]}
          />
        );
      },
    },
  ];
}
