import React from 'react';
import type { OrderInfoGridItem } from '@/components/common/OrderInfoGrid';
import type { CardSizeQuantityItem } from '@/utils/cardSizeQuantity';
import { splitStyleOptions } from '@/utils/styleOptions';
import { sortSizeNames } from '@/utils/api/size';

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

/** D-321: 码数表头短码展示——"XS(155/80A)"→"XS"，完整规格悬停 tooltip；
 *  全长标签直接进表头会把 1fr 列压穿、nowrap 文字互相叠画（D-167 同款重叠炸弹） */
export const shortSizeLabel = (size: string) => size.replace(/\([^)]*\)/g, '').trim() || size;

const splitFallbackSizes = (value?: string) => splitStyleOptions(value);

/** D-360g：尺寸值含分隔符（逗号/顿号/空格）说明是"合并串"脏数据（如 XS,S,M,L,XL），
 *  真实码数不可能含分隔符——矩阵表头剔除，避免码数重复/挤占列 */
const isMergedSizeArtifact = (size: string) => /[,，、\s]/.test(size);

const createSizeOrder = (items: CardSizeQuantityItem[], fallbackSizes: string[]) => {
  const ordered: string[] = [];
  const seen = new Set<string>();
  [...items.map((item) => String(item.size || '').trim()), ...fallbackSizes].forEach((size) => {
    if (!size || isMergedSizeArtifact(size) || seen.has(size)) return;
    seen.add(size);
    ordered.push(size);
  });
  // 全系统统一：码数按从小到大排序（XS→S→M→L→XL→…），不再依赖后端返回顺序
  return sortSizeNames(ordered);
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

  const sizeColCap = Math.max(34, columnMinWidth);
  const gridTemplateColumns = `auto repeat(${model.sizes.length}, minmax(min-content, ${sizeColCap}px))`;

  return [
    {
      fullRow: true,
      value: (
        <div style={{ overflowX: 'auto', minWidth: 0 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns,
            columnGap: gap,
            rowGap: 2,
            alignItems: 'center',
            minWidth: 'max-content',
          }}>
            <span style={leadLabelStyle}>码数</span>
            {model.sizes.map((size) => (
              <span key={`matrix-size-${size}`} style={headerCellStyle} title={size}>{shortSizeLabel(size)}</span>
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
  // D-321: 单网格保证表头/数量/商品编码各行列宽严格对齐；minmax(min-content, cap)——
  // 短码封顶cap均分卡片宽度，长标签(如无法缩写的"155/80A")按内容宽不让列压穿（min>max时CSS取min）
  const sizeColCap = Math.max(34, columnMinWidth);
  const gridTemplateColumns = `${leadTrack} repeat(${model.sizes.length}, minmax(min-content, ${sizeColCap}px))`;
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
  const headerCellStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ ...wrapStyle, overflowX: 'auto' }}>
      {/* D-321: minWidth max-content——列永不压缩，超宽时外层横滑（D-199/D-202 scroll-x 范式） */}
      <div style={{
        display: 'grid',
        gridTemplateColumns,
        columnGap: gap,
        rowGap: 2,
        alignItems: 'center',
        minWidth: 'max-content',
      }}>
        {/* D-138 尺码表头行：短码+悬停完整规格——先看列是哪个码，再看数量 */}
        <span style={{ ...leadStyle, color: 'var(--neutral-text-light, var(--color-text-muted))' }}>颜色</span>
        {model.sizes.map((size) => (
          <span key={`head-${size}`} style={headerCellStyle} title={size}>
            {shortSizeLabel(size)}
          </span>
        ))}
        {model.rows.map((row) => (
          <React.Fragment key={`row-${row.label}`}>
            <span style={leadStyle}>{row.label}</span>
            {model.sizes.map((size) => {
              const qty = row.quantityMap.get(size) || 0;
              return (
                <span key={`${row.label}-${size}`} style={qtyCellStyle}>
                  {qty > 0 ? qty : ''}
                </span>
              );
            })}
          </React.Fragment>
        ))}
        {/* D-138 商品编码行：样衣开发同款——每颜色一行，格内展示对应尺码的商品编码 */}
        {model.hasSku && model.rows.map((row) => (
          <React.Fragment key={`sku-${row.label}`}>
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
          </React.Fragment>
        ))}
        <span style={{ ...leadStyle, alignSelf: 'flex-end', overflow: 'visible', color: 'var(--neutral-text, var(--color-gray-800))', fontWeight: 700 }}>{totalLabel}</span>
        <span style={{ ...headerCellStyle, fontWeight: 700, gridColumn: `2 / ${model.sizes.length + 2}`, textAlign: 'left' }}>
          {totalLabel === '总数' ? '' : `${totalLabel}：`}{model.total}{totalSuffix}
        </span>
      </div>
    </div>
  );
};

export default OrderColorSizeMatrix;
