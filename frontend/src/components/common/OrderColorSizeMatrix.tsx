import React from 'react';
import type { OrderInfoGridItem } from '@/components/common/OrderInfoGrid';
import type { CardSizeQuantityItem } from '@/utils/cardSizeQuantity';

interface OrderColorSizeMatrixProps {
  items: CardSizeQuantityItem[];
  fallbackColor?: string;
  fallbackSize?: string;
  fallbackQuantity?: number;
  totalLabel?: string;
  totalSuffix?: string;
  leadWidth?: number | string;
  columnMinWidth?: number;
  gap?: number;
  fontSize?: number;
}

export interface OrderColorSizeMatrixModelRow {
  label: string;
  quantityMap: Map<string, number>;
}

export interface OrderColorSizeMatrixModel {
  sizes: string[];
  rows: OrderColorSizeMatrixModelRow[];
  total: number;
  hasData: boolean;
}

export interface OrderColorSizeMatrixInfoItemsOptions {
  items: CardSizeQuantityItem[];
  fallbackColor?: string;
  fallbackSize?: string;
  fallbackQuantity?: number;
  totalLabel?: string;
  totalSuffix?: string;
  columnMinWidth?: number;
  gap?: number;
  fontSize?: number;
  labelStyle?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const rowBaseStyle: React.CSSProperties = {
  display: 'grid',
  alignItems: 'center',
  minWidth: 0,
};

const splitFallbackSizes = (value?: string) => String(value || '')
  .split(/[/,，、\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const createSizeOrder = (items: CardSizeQuantityItem[], fallbackSizes: string[]) => {
  const ordered: string[] = [];
  const seen = new Set<string>();
  [...items.map((item) => String(item.size || '').trim()), ...fallbackSizes].forEach((size) => {
    if (!size || seen.has(size)) return;
    seen.add(size);
    ordered.push(size);
  });
  return ordered;
};

export const buildOrderColorSizeMatrixModel = ({
  items,
  fallbackColor,
  fallbackSize,
  fallbackQuantity,
}: Pick<OrderColorSizeMatrixProps, 'items' | 'fallbackColor' | 'fallbackSize' | 'fallbackQuantity'>): OrderColorSizeMatrixModel => {
  const normalizedFallbackColor = String(fallbackColor || '').trim();
  const fallbackSizes = splitFallbackSizes(fallbackSize);
  const normalizedFallbackQuantity = Number(fallbackQuantity || 0);
  const normalizedItems = items.length > 0
    ? items
    : (fallbackSizes.length > 0 && normalizedFallbackQuantity > 0
      ? fallbackSizes.map((size) => ({ color: normalizedFallbackColor, size, quantity: normalizedFallbackQuantity }))
      : []);

  if (normalizedItems.length === 0) {
    return { sizes: [], rows: [], total: 0, hasData: false };
  }

  const sizes = createSizeOrder(normalizedItems, fallbackSizes);
  if (sizes.length === 0) {
    return { sizes: [], rows: [], total: 0, hasData: false };
  }

  const rows: OrderColorSizeMatrixModelRow[] = [];
  const rowMap = new Map<string, Map<string, number>>();
  normalizedItems.forEach((item) => {
    const color = String(item.color || '').trim() || normalizedFallbackColor || '未设色';
    if (!rowMap.has(color)) {
      const quantityMap = new Map<string, number>();
      rowMap.set(color, quantityMap);
      rows.push({ label: color, quantityMap });
    }
    const quantityMap = rowMap.get(color)!;
    const size = String(item.size || '').trim();
    quantityMap.set(size, (quantityMap.get(size) || 0) + (Number(item.quantity) || 0));
  });

  return {
    sizes,
    rows,
    total: normalizedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    hasData: true,
  };
};

export const createOrderColorSizeMatrixInfoItems = ({
  items,
  fallbackColor,
  fallbackSize,
  fallbackQuantity,
  totalLabel = '总数',
  totalSuffix = '',
  columnMinWidth = 0,
  gap = 6,
  fontSize = 12,
  labelStyle,
  valueStyle,
}: OrderColorSizeMatrixInfoItemsOptions): OrderInfoGridItem[] => {
  const model = buildOrderColorSizeMatrixModel({ items, fallbackColor, fallbackSize, fallbackQuantity });
  if (!model.hasData) {
    return [{ label: '码数', value: '-', labelStyle, valueStyle }];
  }

  const leadLabelStyle: React.CSSProperties = {
    color: 'var(--neutral-text-light, #98a2b3)',
    fontSize: labelStyle?.fontSize || fontSize,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textAlign: 'left',
    alignSelf: 'center',
    ...(labelStyle || {}),
  };

  const headerCellStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize,
    color: 'var(--neutral-text, #262626)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  const qtyCellStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize,
    color: 'var(--color-info)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  const totalValueStyle: React.CSSProperties = {
    fontSize,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    color: 'var(--neutral-text-light, #8c8c8c)',
    ...(valueStyle || {}),
  };

  const gridTemplateColumns = `auto repeat(${model.sizes.length}, minmax(${Math.max(columnMinWidth, 28)}px, 1fr))`;

  return [
    {
      fullRow: true,
      value: (
        <div style={{
          display: 'grid',
          gridTemplateColumns,
          columnGap: gap,
          rowGap: 2,
          alignItems: 'center',
          minWidth: 0,
        }}>
          <span style={leadLabelStyle}>码数</span>
          {model.sizes.map((size) => (
            <span key={`matrix-size-${size}`} style={headerCellStyle}>{size}</span>
          ))}
          {model.rows.map((row) => (
            <React.Fragment key={`matrix-row-${row.label}`}>
              <span style={leadLabelStyle}>{row.label}</span>
              {model.sizes.map((size) => (
                <span key={`matrix-${row.label}-${size}`} style={qtyCellStyle}>
                  {row.quantityMap.get(size) || 0}
                </span>
              ))}
            </React.Fragment>
          ))}
          <span style={leadLabelStyle}>{totalLabel}</span>
          <span style={{ ...totalValueStyle, gridColumn: `span ${model.sizes.length}` }}>
            {model.total}{totalSuffix}
          </span>
        </div>
      ),
    },
  ];
};

const OrderColorSizeMatrix: React.FC<OrderColorSizeMatrixProps> = ({
  items,
  fallbackColor,
  fallbackSize,
  fallbackQuantity,
  totalLabel = '总数',
  totalSuffix = '',
  leadWidth = 'max-content',
  columnMinWidth = 0,
  gap = 6,
  fontSize = 12,
}) => {
  const model = buildOrderColorSizeMatrixModel({ items, fallbackColor, fallbackSize, fallbackQuantity });
  if (!model.hasData) {
    return <>-</>;
  }
  const leadTrack = typeof leadWidth === 'number' ? `${leadWidth}px` : (String(leadWidth || '').trim() || 'max-content');
  const gridTemplateColumns = `${leadTrack} repeat(${model.sizes.length}, minmax(${columnMinWidth}px, 1fr))`;
  const leadStyle: React.CSSProperties = {
    color: 'var(--neutral-text-light, #8c8c8c)',
    fontSize,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  const headerCellStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize,
    color: 'var(--neutral-text, #262626)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
  const qtyCellStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize,
    color: 'var(--color-info)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
  const totalStyle: React.CSSProperties = {
    alignSelf: 'flex-end',
    fontSize,
    color: 'var(--neutral-text, #262626)',
    fontWeight: 700,
  };

  return (
    <div style={wrapStyle}>
      <div style={{ ...rowBaseStyle, gridTemplateColumns, gap }}>
        <span style={leadStyle}>码数</span>
        {model.sizes.map((size) => (
          <span key={`size-${size}`} style={headerCellStyle}>{size}</span>
        ))}
      </div>
      {model.rows.map((row) => (
        <div key={row.label} style={{ ...rowBaseStyle, gridTemplateColumns, gap }}>
          <span style={leadStyle}>{row.label}</span>
          {model.sizes.map((size) => (
            <span key={`${row.label}-${size}`} style={qtyCellStyle}>
              {row.quantityMap.get(size) || 0}
            </span>
          ))}
        </div>
      ))}
      <div style={totalStyle}>{totalLabel}：{model.total}{totalSuffix}</div>
    </div>
  );
};

export default OrderColorSizeMatrix;
