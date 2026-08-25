import React from 'react';
import type { OrderInfoGridItem } from '@/components/common/OrderInfoGrid';
import type { CardSizeQuantityItem } from '@/utils/cardSizeQuantity';
import { splitStyleOptions } from '@/utils/styleOptions';

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
  /** D-138 商品编码：color|size → skuNo（有值时只读矩阵展示商品编码行） */
  skuMap: Map<string, string>;
}

export interface OrderColorSizeMatrixModel {
  sizes: string[];
  rows: OrderColorSizeMatrixModelRow[];
  total: number;
  hasData: boolean;
  /** 是否存在任一商品编码（决定矩阵是否渲染商品编码行） */
  hasSku: boolean;
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

const splitFallbackSizes = (value?: string) => splitStyleOptions(value);

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
    return { sizes: [], rows: [], total: 0, hasData: false, hasSku: false };
  }

  const sizes = createSizeOrder(normalizedItems, fallbackSizes);
  if (sizes.length === 0) {
    return { sizes: [], rows: [], total: 0, hasData: false, hasSku: false };
  }

  const rows: OrderColorSizeMatrixModelRow[] = [];
  const rowMap = new Map<string, OrderColorSizeMatrixModelRow>();
  normalizedItems.forEach((item) => {
    const color = String(item.color || '').trim() || normalizedFallbackColor || '未设色';
    if (!rowMap.has(color)) {
      const row: OrderColorSizeMatrixModelRow = { label: color, quantityMap: new Map<string, number>(), skuMap: new Map<string, string>() };
      rowMap.set(color, row);
      rows.push(row);
    }
    const row = rowMap.get(color)!;
    const size = String(item.size || '').trim();
    row.quantityMap.set(size, (row.quantityMap.get(size) || 0) + (Number(item.quantity) || 0));
    const skuNo = String((item as CardSizeQuantityItem).skuNo || '').trim();
    if (skuNo) {
      row.skuMap.set(size, skuNo);
    }
  });

  return {
    sizes,
    rows,
    total: normalizedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    hasData: true,
    hasSku: rows.some((row) => row.skuMap.size > 0),
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
    color: 'var(--neutral-text-light, var(--color-slate-400))',
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
    color: 'var(--neutral-text, var(--color-gray-800))',
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
    color: 'var(--neutral-text-light, var(--color-text-muted))',
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

export const ColorSizeMatrixPopoverContent: React.FC<{
  model: OrderColorSizeMatrixModel;
  title?: string;
}> = ({ model, title = '颜色码数' }) => {
  if (!model.hasData) return null;
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14, color: 'var(--color-text-primary)' }}>{title}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `max-content repeat(${model.sizes.length}, minmax(20px, max-content))`,
        columnGap: 6,
        rowGap: 2,
        fontSize: 14,
        textAlign: 'center',
      }}>
        <span style={{ color: 'var(--color-slate-400)', fontWeight: 600 }}>码</span>
        {model.sizes.map(s => <span key={`h-${s}`} style={{ fontWeight: 600 }}>{s}</span>)}
        {model.rows.map(row => (
          <React.Fragment key={row.label}>
            <span style={{ color: 'var(--color-slate-400)', textAlign: 'left' }}>{row.label}</span>
            {model.sizes.map(s => (
              <span key={`${row.label}-${s}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                {row.quantityMap.get(s) || 0}
              </span>
            ))}
          </React.Fragment>
        ))}
        <span style={{ color: 'var(--color-slate-400)', fontWeight: 600 }}>总</span>
        <span style={{ gridColumn: `2 / ${model.sizes.length + 2}`, fontWeight: 700, textAlign: 'left' }}>
          {model.total}件
        </span>
      </div>
    </div>
  );
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
    color: 'var(--neutral-text-light, var(--color-text-muted))',
    fontSize,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
    color: 'var(--neutral-text, var(--color-gray-800))',
    fontWeight: 700,
  };

  return (
    <div style={wrapStyle}>
      {/* D-138 尺码表头行：与样衣开发布局对齐——先看列是哪个码，再看数量 */}
      <div style={{ ...rowBaseStyle, gridTemplateColumns, gap }}>
        <span style={{ ...leadStyle, color: 'var(--neutral-text-light, var(--color-text-muted))' }}>颜色</span>
        {model.sizes.map((size) => (
          <span
            key={`head-${size}`}
            style={{
              textAlign: 'center',
              fontSize,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            {size}
          </span>
        ))}
      </div>
      {model.rows.map((row) => (
        <div key={row.label} style={{ ...rowBaseStyle, gridTemplateColumns, gap }}>
          <span style={leadStyle}>{row.label}</span>
          {model.sizes.map((size) => {
            const qty = row.quantityMap.get(size) || 0;
            return (
              <span key={`${row.label}-${size}`} style={qtyCellStyle}>
                {qty > 0 ? qty : ''}
              </span>
            );
          })}
        </div>
      ))}
      {/* D-138 商品编码行：样衣开发同款——每颜色一行，格内展示对应尺码的商品编码 */}
      {model.hasSku && model.rows.map((row) => (
        <div key={`sku-${row.label}`} style={{ ...rowBaseStyle, gridTemplateColumns, gap }}>
          <span style={{ ...leadStyle, fontSize: Math.max(10, fontSize - 1), color: 'var(--color-text-tertiary)' }}>商品编码</span>
          {model.sizes.map((size) => {
            const sku = row.skuMap.get(size) || '';
            return (
              <span
                key={`sku-${row.label}-${size}`}
                title={sku}
                style={{
                  textAlign: 'center',
                  fontSize: Math.max(10, fontSize - 1),
                  color: 'var(--color-text-tertiary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {sku}
              </span>
            );
          })}
        </div>
      ))}
      <div style={totalStyle}>{totalLabel}：{model.total}{totalSuffix}</div>
    </div>
  );
};

export default OrderColorSizeMatrix;
