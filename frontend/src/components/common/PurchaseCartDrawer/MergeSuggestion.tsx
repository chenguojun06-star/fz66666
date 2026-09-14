import React, { useMemo } from 'react';
import { Card, Button, Table } from 'antd';
import { MergeCellsOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MergeSuggestion, MergeableItem } from '@/types/purchaseCart';

interface MergeSuggestionCardProps {
  suggestions: MergeSuggestion[];
  onMerge: (request: any) => void;
  submitting: boolean;
}

interface MergeRow {
  key: string;
  materialName: string;
  materialCode: string;
  specifications?: string;
  items: MergeableItem[];
  totalQty: number;
  suggestion: MergeSuggestion;
}

export const MergeSuggestionCard: React.FC<MergeSuggestionCardProps> = ({
  suggestions,
  onMerge,
  submitting,
}) => {
  // Hooks 必须在早返回之前调用，否则违反 Rules of Hooks
  const rows = useMemo<MergeRow[]>(
    () => suggestions.map((s, idx) => ({
      key: `${s.materialCode}-${idx}`,
      materialName: s.materialName,
      materialCode: s.materialCode,
      specifications: s.specifications,
      items: s.items,
      totalQty: s.items.reduce((sum, item) => sum + item.quantity, 0),
      suggestion: s,
    })),
    [suggestions]
  );

  if (suggestions.length === 0) return null;

  const handleMerge = (suggestion: MergeSuggestion) => {
    const totalQty = suggestion.items.reduce((sum, item) => sum + item.quantity, 0);

    onMerge({
      itemIds: suggestion.items.map(item => item.id),
      targetQuantity: totalQty,
      targetSupplierId: suggestion.items[0].supplierId,
      targetSupplierName: suggestion.items[0].supplierName,
    });
  };

  const columns: ColumnsType<MergeRow> = [
    {
      title: '物料',
      key: 'material',
      render: (_, row) => (
        <div className="u-d-flex u-fd-column">
          <span className="u-fw-600">{row.materialName}</span>
          <span className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>{row.materialCode}</span>
          {row.specifications && (
            <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{row.specifications}</span>
          )}
        </div>
      ),
    },
    {
      title: '供应商明细',
      key: 'suppliers',
      render: (_, row) => (
        <div className="u-d-flex u-fd-column" style={{ gap: 2 }}>
          {row.items.map((item, i) => (
            <span key={i} className="u-fs-12">
              {item.supplierName || '-'}
              <span className="u-ml-8" style={{ color: 'var(--color-text-tertiary)' }}>×{item.quantity}</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      title: '合并后总数量',
      dataIndex: 'totalQty',
      width: 130,
      align: 'right',
      render: (qty: number) => (
        <span className="u-fw-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{qty}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'right',
      render: (_, row) => (
        <Button
          size="small"
          type="primary"
          icon={<MergeCellsOutlined />}
          onClick={() => handleMerge(row.suggestion)}
          loading={submitting}
        >
          合并
        </Button>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={
        <span className="u-fw-600" style={{ color: 'var(--color-warning)' }}>
          🔔 推荐合并 ({suggestions.length})
        </span>
      }
      style={{ margin: '12px 16px' }}
      styles={{ body: { padding: 0 } }}
    >
      <Table<MergeRow>
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={false}
        showHeader={false}
      />
    </Card>
  );
};

export default MergeSuggestionCard;
