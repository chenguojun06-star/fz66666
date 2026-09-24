/**
 * D-529：组合商品「包含商品」明细表格 —— 编辑态可改数量/移除，查看态纯展示。
 * 行数据统一 ComboItemRow（skuCode 权威键），子SKU可用库存用于库存评估。
 */
import React from 'react';
import { Button, InputNumber } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import { formatMoney } from '@/utils/format';
import type { ComboProductItem } from '@/services/warehouse/comboProductApi';

export type ComboItemRow = ComboProductItem;

interface Props {
  items: ComboItemRow[];
  editing: boolean;
  onQtyChange?: (index: number, qty: number | null) => void;
  onRemove?: (index: number) => void;
}

const ComboItemTable: React.FC<Props> = ({ items, editing, onQtyChange, onRemove }) => {
  const columns = React.useMemo(() => {
    const cols: Array<Record<string, unknown>> = [
      {
        title: '图片',
        key: 'image',
        width: 64,
        render: (_: unknown, r: ComboItemRow) => (
          <StyleCoverThumb src={r.styleImage || null} styleNo={r.styleNo} styleId={r.styleId} size={44} />
        ),
      },
      {
        title: '商品编码',
        dataIndex: 'skuCode',
        key: 'skuCode',
        width: 190,
        render: (v: string) => <span title={v} style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v || '-'}</span>,
      },
      {
        title: '款式编码',
        dataIndex: 'styleNo',
        key: 'styleNo',
        width: 130,
        render: (v: string) => v || '-',
      },
      {
        title: '商品名称',
        dataIndex: 'styleName',
        key: 'styleName',
        width: 160,
        render: (v: string) => v || '-',
      },
      {
        title: '颜色及规格',
        key: 'colorSize',
        width: 140,
        render: (_: unknown, r: ComboItemRow) => [r.color, r.size].filter(Boolean).join('/') || '-',
      },
      {
        title: '可用库存',
        dataIndex: 'availableQty',
        key: 'availableQty',
        width: 90,
        align: 'right' as const,
        render: (v: number | undefined) => (
          <span style={{ color: (v || 0) > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{v ?? '-'}</span>
        ),
      },
      {
        title: '销售单价',
        dataIndex: 'salesPrice',
        key: 'salesPrice',
        width: 100,
        align: 'right' as const,
        render: (v: number | null | undefined) => (v != null ? formatMoney(v) : '-'),
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 120,
        align: 'right' as const,
        render: (v: number, _r: ComboItemRow, index: number) =>
          editing ? (
            <InputNumber
              size="small"
              min={1}
              precision={0}
              value={v}
              style={{ width: 90 }}
              onChange={(val) => onQtyChange?.(index, val)}
            />
          ) : (
            v
          ),
      },
    ];
    if (editing) {
      cols.push({
        title: '操作',
        key: 'action',
        width: 70,
        render: (_: unknown, _r: ComboItemRow, index: number) => (
          <Button type="link" size="small" style={{ padding: 0 }} danger onClick={() => onRemove?.(index)}>
            移除
          </Button>
        ),
      });
    }
    return cols;
  }, [editing, onQtyChange, onRemove]);

  return (
    <ResizableTable
      size="small"
      columns={columns as never}
      dataSource={items}
      rowKey={(r: ComboItemRow, i?: number) => r.skuCode || String(i)}
      pagination={false}
      emptyDescription="暂无子商品，请点击上方搜索添加（至少2个不同商品）"
    />
  );
};

export default ComboItemTable;
