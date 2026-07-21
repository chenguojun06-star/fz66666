import React from 'react';
import { Space, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ShopOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import FactoryAuditPopover from './FactoryAuditPopover';
import { toMoney } from '@/utils/format';
import type { FactorySummaryRow } from './useFactorySummaryData';

export function getFactorySummaryColumns(
  auditedOrderNos: Set<string>,
  pushedFactoryIds: Set<string>,
  handleApprove: (record: FactorySummaryRow) => void,
  handleReject: (record: FactorySummaryRow) => void,
  openDrilldown: (record: FactorySummaryRow) => void,
): ColumnsType<FactorySummaryRow> {
  return [
    {
      title: '工厂名称',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 260,
      render: (text: string, record: FactorySummaryRow) => (
        <FactoryAuditPopover record={record} auditedOrderNos={auditedOrderNos}>
          <div style={{ lineHeight: 1.35 }}>
            <Space>
              <ShopOutlined style={{ color: record.factoryType === 'INTERNAL' ? 'var(--color-warning)' : 'var(--primary-color)' }} />
              <span style={{ fontWeight: 500, cursor: 'pointer', borderBottom: '1px dashed var(--primary-color)' }}>{text}</span>
              {record.factoryType === 'INTERNAL' && (
                <Tooltip title="内部工厂——工人工资已通过「工资结算」按人员审核，无需在此推送订单结算">
                  <Tag color="orange" style={{ margin: 0, fontSize: 14 }}>内部</Tag>
                </Tooltip>
              )}
              {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 14 }}>外部</Tag>}
            </Space>
            {record.orgPath || record.parentOrgUnitName ? (
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 14, marginTop: 4 }}>
                {record.orgPath || record.parentOrgUnitName}
              </div>
            ) : null}
          </div>
        </FactoryAuditPopover>
      ),
    },
    {
      title: '订单数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 90,
      align: 'center',
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '下单总量',
      dataIndex: 'totalOrderQuantity',
      key: 'totalOrderQuantity',
      width: 100,
      align: 'right',
      render: (v: number) => v?.toLocaleString() ?? 0,
    },
    {
      title: '入库总量',
      dataIndex: 'totalWarehousedQuantity',
      key: 'totalWarehousedQuantity',
      width: 100,
      align: 'right',
      render: (v: number) => v?.toLocaleString() ?? 0,
    },
    {
      title: '次品量',
      dataIndex: 'totalDefectQuantity',
      key: 'totalDefectQuantity',
      width: 80,
      align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? 'var(--color-danger)' : undefined }}>
          {v?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      title: '面辅料成本',
      dataIndex: 'totalMaterialCost',
      key: 'totalMaterialCost',
      width: 120,
      align: 'right',
      render: (v: unknown) => `¥${toMoney(v)}`,
    },
    {
      title: '生产成本',
      dataIndex: 'totalProductionCost',
      key: 'totalProductionCost',
      width: 110,
      align: 'right',
      render: (v: unknown) => `¥${toMoney(v)}`,
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right',
      render: (v: unknown, record: FactorySummaryRow) => (
        <span
          style={{ fontWeight: 600, color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline' }}
          title="点击查看订单明细"
          onClick={() => openDrilldown(record)}
        >
          ¥{toMoney(v)}
        </span>
      ),
    },
    {
      title: '利润',
      dataIndex: 'totalProfit',
      key: 'totalProfit',
      width: 120,
      align: 'right',
      render: (v: unknown) => {
        const n = Number(v);
        const color = n >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
        return <span style={{ fontWeight: 500, color }}>¥{toMoney(v)}</span>;
      },
    },
    {
      title: '订单号列表',
      dataIndex: 'orderNos',
      key: 'orderNos',
      width: 200,
      ellipsis: true,
      render: (orderNos: string[]) => {
        if (!orderNos?.length) return '-';
        const display = orderNos.slice(0, 3).join(', ');
        const extra = orderNos.length > 3 ? ` +${orderNos.length - 3}` : '';
        return (
          <Tooltip title={orderNos.join('\n')}>
            <span>{display}{extra}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: FactorySummaryRow) => {
        const factoryKey = record.factoryId || record.factoryName;
        if (pushedFactoryIds.has(factoryKey)) {
          return <Tag icon={<CheckCircleOutlined />} color="success">已推送</Tag>;
        }
        // 内部工厂不允许走订单结算，需通过「工资结算」按人员审核
        if (record.factoryType === 'INTERNAL') {
          return (
            <Tooltip title="内部工厂需到「工资结算」按人员审核，无需在此推送">
              <Tag color="default">设工资结算</Tag>
            </Tooltip>
          );
        }
        const actions: RowAction[] = [
          {
            key: 'push',
            label: '终审推送',
            primary: true,
            onClick: () => handleApprove(record),
          },
          {
            key: 'reject',
            label: '驳回',
            danger: true,
            onClick: () => handleReject(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];
}

export function renderFactorySummarySummary(
  filteredData: FactorySummaryRow[],
  summary: {
    totalOrders: number;
    totalQty: number;
    totalWarehoused: number;
    totalDefect: number;
    totalMaterialCost: number;
    totalProductionCost: number;
    totalAmount: number;
    totalProfit: number;
  },
) {
  return (
    <ResizableTable.Summary fixed>
      <ResizableTable.Summary.Row>
        <ResizableTable.Summary.Cell index={0} colSpan={2}>
          <strong>合计 ({filteredData.length} 个工厂)</strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={2} align="center">
          <strong>{summary.totalOrders}</strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={3} align="right">
          <strong>{summary.totalQty.toLocaleString()}</strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={4} align="right">
          <strong>{summary.totalWarehoused.toLocaleString()}</strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={5} align="right">
          <strong style={{ color: summary.totalDefect > 0 ? 'var(--color-danger)' : undefined }}>
            {summary.totalDefect}
          </strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={6} align="right">
          ¥{toMoney(summary.totalMaterialCost)}
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={7} align="right">
          ¥{toMoney(summary.totalProductionCost)}
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={8} align="right">
          <strong style={{ color: 'var(--primary-color)' }}>
            ¥{toMoney(summary.totalAmount)}
          </strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={9} align="right">
          <strong style={{ color: summary.totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            ¥{toMoney(summary.totalProfit)}
          </strong>
        </ResizableTable.Summary.Cell>
        <ResizableTable.Summary.Cell index={10} />
        <ResizableTable.Summary.Cell index={11} />
      </ResizableTable.Summary.Row>
    </ResizableTable.Summary>
  );
}
