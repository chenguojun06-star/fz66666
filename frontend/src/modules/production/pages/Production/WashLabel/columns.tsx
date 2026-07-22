import React from 'react';
import { Button, Input, Tooltip } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import type { ProductionOrder } from '@/types/production';
import type { ColumnsType } from 'antd/es/table';
import type { StyleLabelCache } from './utils';
import { getDisplayColorText, getDisplaySizeText, getOrderLines } from './utils';

interface BuildColumnsOptions {
  styleCache: React.MutableRefObject<StyleLabelCache>;
  uCodeOverrides: Record<string, string>;
  setUCodeOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  getUCode: (order: ProductionOrder) => string;
  printingOrderId: string | null;
  openBatchPrint: (targetOrders: ProductionOrder[]) => Promise<void>;
}

export function buildColumns({
  styleCache,
  uCodeOverrides,
  setUCodeOverrides,
  getUCode,
  printingOrderId,
  openBatchPrint,
}: BuildColumnsOptions): ColumnsType<ProductionOrder> {
  return [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 120,
      ellipsis: true,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (_: unknown, record: ProductionOrder) => getDisplayColorText(record),
    },
    {
      title: '码数',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (_: unknown, record: ProductionOrder) => getDisplaySizeText(record),
    },
    {
      title: (
        <Tooltip title="来源：款式开发 → 面料成分">
          面料成分
        </Tooltip>
      ),
      key: 'fabricComposition',
      width: 200,
      ellipsis: true,
      render: (_: unknown, record: ProductionOrder) => {
        const cached = styleCache.current[record.styleId];
        if (cached === undefined) return <span style={{ color: 'var(--color-text-quaternary)' }}>--</span>;
        return cached.fabricComposition
          ? <Tooltip title={cached.fabricComposition}><span>{cached.fabricComposition}</span></Tooltip>
          : <span style={{ color: 'var(--color-warning)' }}>未填写</span>;
      },
    },
    {
      title: (
        <Tooltip title="来源：款式开发 → 洗涤说明">
          洗涤说明
        </Tooltip>
      ),
      key: 'washInstructions',
      width: 200,
      ellipsis: true,
      render: (_: unknown, record: ProductionOrder) => {
        const cached = styleCache.current[record.styleId];
        if (cached === undefined) return <span style={{ color: 'var(--color-text-quaternary)' }}>--</span>;
        return cached.washInstructions
          ? <Tooltip title={cached.washInstructions}><span>{cached.washInstructions}</span></Tooltip>
          : <span style={{ color: 'var(--color-warning)' }}>未填写</span>;
      },
    },
    {
      title: (
        <Tooltip title="默认：款号-颜色-码数-订单号后6位，可修改">
          U编码
        </Tooltip>
      ),
      key: 'uCode',
      width: 200,
      render: (_: unknown, record: ProductionOrder) => {
        const lineCount = getOrderLines(record).length;
        if (lineCount > 1) {
          return <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{`按SKU生成 ${lineCount} 条`}</span>;
        }
        return (
          <Input
            value={record.id ? (uCodeOverrides[record.id] ?? getUCode(record)) : getUCode(record)}
            onChange={e => record.id && setUCodeOverrides(prev => ({ ...prev, [record.id!]: e.target.value }))}
            style={{ width: 185 }}
            placeholder="自动生成"
          />
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 80,
      render: (_: unknown, record: ProductionOrder) => (
        <Button
          icon={<PrinterOutlined />}
          loading={record.id === printingOrderId}
          onClick={() => void openBatchPrint([record])}
        >
          打印
        </Button>
      ),
    },
  ];
}
