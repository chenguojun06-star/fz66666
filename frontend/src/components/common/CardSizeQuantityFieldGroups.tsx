import React from 'react';
import type { CardField } from '@/components/common/UniversalCardView';
import OrderColorSizeMatrix from '@/components/common/OrderColorSizeMatrix';
import type { CardSizeQuantityItem } from '@/utils/cardSizeQuantity';

interface CreateCardSizeQuantityFieldGroupsOptions<TRecord> {
  sizeKey: string;
  quantityKey: string;
  getItems: (record: TRecord) => CardSizeQuantityItem[];
  getFallbackSize?: (record: TRecord) => string;
  getFallbackQuantity?: (record: TRecord) => number;
  quantityUnit?: string;
  quantityTotalPrefix?: string;
}

interface CreateCardSpecFieldGroupsOptions<TRecord> extends CreateCardSizeQuantityFieldGroupsOptions<TRecord> {
  colorKey: string;
  getFallbackColor?: (record: TRecord) => string;
}

interface CreateOrderColorSizeGridFieldGroupsOptions<TRecord> {
  gridKey: string;
  getItems: (record: TRecord) => CardSizeQuantityItem[];
  getFallbackColor?: (record: TRecord) => string;
  getFallbackSize?: (record: TRecord) => string;
  getFallbackQuantity?: (record: TRecord) => number;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
  flexWrap: 'wrap',
  alignItems: 'center',
};

// D-213：码数格自适应宽度（chip 样式）——固定22px会让 XS(155/72A) 类长码溢出绘制堆成一片；
// 码数/数量两行同宽 chip，wrap 换行时上下仍按列对齐
const cellStyle: React.CSSProperties = {
  minWidth: '64px',
  padding: '1px 4px',
  textAlign: 'center',
  fontSize: '11px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  background: 'var(--color-bg-subtle, #f5f5f5)',
  borderRadius: 4,
};

const quantityCellStyle: React.CSSProperties = {
  ...cellStyle,
  color: 'var(--color-info)',
  fontWeight: 600,
};

const summaryStyle: React.CSSProperties = {
  marginLeft: '4px',
  color: 'var(--neutral-text-light, var(--color-text-muted))',
  fontSize: 'var(--font-size-sm)',
  flexShrink: 0,
};

const renderSizeValue = <TRecord,>(
  items: CardSizeQuantityItem[],
  record: TRecord,
  getFallbackSize?: (record: TRecord) => string,
) => {
  if (items.length > 0) {
    return (
      <div style={rowStyle}>
        {items.map((item, index) => (
          <span key={`${item.size}-${index}`} style={cellStyle}>
            {item.size || '-'}
          </span>
        ))}
      </div>
    );
  }

  const fallback = getFallbackSize?.(record);
  return fallback || '-';
};

const renderQuantityValue = <TRecord,>(
  items: CardSizeQuantityItem[],
  record: TRecord,
  getFallbackQuantity?: (record: TRecord) => number,
  quantityUnit?: string,
  quantityTotalPrefix?: string,
) => {
  if (items.length > 0) {
    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    return (
      <div style={rowStyle}>
        {items.map((item, index) => (
          <span key={`${item.size}-${index}`} style={quantityCellStyle}>
            {item.quantity || 0}
          </span>
        ))}
        <span style={summaryStyle}>{`${quantityTotalPrefix || '共'}${total}`}</span>
      </div>
    );
  }

  const fallbackQuantity = Number(getFallbackQuantity?.(record) || 0);
  return fallbackQuantity > 0 ? `${fallbackQuantity}${quantityUnit || ''}` : '-';
};

const renderOrderColorSizeGridValue = <TRecord,>(
  items: CardSizeQuantityItem[],
  record: TRecord,
  getFallbackColor?: (record: TRecord) => string,
  getFallbackSize?: (record: TRecord) => string,
  getFallbackQuantity?: (record: TRecord) => number,
  totalSuffix?: string,
) => {
  return (
    <OrderColorSizeMatrix
      items={items}
      fallbackColor={getFallbackColor?.(record)}
      fallbackSize={getFallbackSize?.(record)}
      fallbackQuantity={getFallbackQuantity?.(record)}
      totalSuffix={totalSuffix}
    />
  );
};

export const createCardSizeQuantityFieldGroups = <TRecord,>({
  sizeKey,
  quantityKey,
  getItems,
  getFallbackSize,
  getFallbackQuantity,
  quantityUnit = '件',
  quantityTotalPrefix = '共',
}: CreateCardSizeQuantityFieldGroupsOptions<TRecord>): CardField[][] => ([
  [
    {
      label: '码数',
      key: sizeKey,
      render: (_value: unknown, record: TRecord) => renderSizeValue(getItems(record), record, getFallbackSize),
    },
  ],
  [
    {
      label: '数量',
      key: quantityKey,
      render: (_value: unknown, record: TRecord) => renderQuantityValue(
        getItems(record),
        record,
        getFallbackQuantity,
        quantityUnit,
        quantityTotalPrefix,
      ),
    },
  ],
]);

export const createCardSpecFieldGroups = <TRecord,>({
  sizeKey,
  quantityKey,
  colorKey,
  getItems,
  getFallbackColor,
  getFallbackSize,
  getFallbackQuantity,
  quantityUnit = '件',
}: CreateCardSpecFieldGroupsOptions<TRecord>): CardField[][] => [
  [
    {
      label: '',
      key: `${colorKey}-${sizeKey}-${quantityKey}`,
      render: (_value: unknown, record: TRecord) => renderOrderColorSizeGridValue(
        getItems(record),
        record,
        getFallbackColor,
        getFallbackSize,
        getFallbackQuantity,
        quantityUnit,
      ),
    },
  ],
];

export const createOrderColorSizeGridFieldGroups = <TRecord,>({
  gridKey,
  getItems,
  getFallbackColor,
  getFallbackSize,
  getFallbackQuantity,
}: CreateOrderColorSizeGridFieldGroupsOptions<TRecord>): CardField[][] => [
  [
    {
      label: '',
      key: gridKey,
      render: (_value: unknown, record: TRecord) => renderOrderColorSizeGridValue(
        getItems(record),
        record,
        getFallbackColor,
        getFallbackSize,
        getFallbackQuantity,
        '件',
      ),
    },
  ],
];
