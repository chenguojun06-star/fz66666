import React from 'react';
import { Row, Col } from 'antd';
import { parseProductionOrderLines, sortSizeNames, toNumberSafe, ProductionOrderLine } from '@/utils/api';
import type { CardSizeQuantityItem } from '@/utils/cardSizeQuantity';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { createOrderColorSizeMatrixInfoItems } from '@/components/common/OrderColorSizeMatrix';
import StyleCoverThumb from './StyleCoverThumb';

type IdLike = string | number;

type OrderHeaderSizeItem = {
  size: string;
  quantity: number;
};

type OrderHeaderCuttingSizeItem = {
  color?: string;
  size: string;
  quantity: number;
};

type OrderHeaderField = {
  label: string;
  value: React.ReactNode;
};

const ProductionOrderHeader: React.FC<{
  order?: any | null;
  orderLines?: ProductionOrderLine[];
  sizeItems?: OrderHeaderSizeItem[];
  cuttingSizeItems?: OrderHeaderCuttingSizeItem[];
  totalQuantity?: number;
  color?: string;
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  styleId?: IdLike;
  styleCover?: string | null;
  coverSize?: number;
  coverNode?: React.ReactNode;
  className?: string;
  extraFields?: OrderHeaderField[];
  showOrderNo?: boolean;
  showColor?: boolean;
  hideEmptyColor?: boolean;
  hideSizeBlockWhenNoRealSize?: boolean;
  matrixColumnMinWidth?: number;
  matrixGap?: number;
  matrixFontSize?: number;
}> = ({
  order,
  orderLines,
  sizeItems,
  cuttingSizeItems,
  totalQuantity,
  color,
  orderNo,
  styleNo,
  styleName,
  styleId,
  styleCover,
  coverSize = 160,
  coverNode,
  className,
  extraFields,
  showOrderNo = true,
  showColor = true,
  hideEmptyColor = false,
  hideSizeBlockWhenNoRealSize = false,
  matrixColumnMinWidth = 0,
  matrixGap = 4,
  matrixFontSize = 12,
}) => {
    const resolvedOrderNo = String(orderNo ?? (order as any)?.orderNo ?? (order as any)?.productionOrderNo ?? '').trim();
    const resolvedStyleNo = String(styleNo ?? (order as any)?.styleNo ?? '').trim();
    const resolvedStyleName = String(styleName ?? (order as any)?.styleName ?? '').trim();
    const resolvedStyleId = (styleId ?? (order as any)?.styleId) as IdLike | undefined;
    const resolvedCover = (styleCover ?? (order as any)?.styleCover ?? null) as string | null;
    const normalizedOrderLines = React.useMemo(
      () => (orderLines ?? parseProductionOrderLines(order)).filter((line) => {
        const size = String(line?.size || '').trim();
        return !!size;
      }),
      [orderLines, order],
    );

    const resolvedColor = React.useMemo(() => {
      const lineColors = Array.from(new Set(
        normalizedOrderLines
          .map((line) => String(line?.color || '').trim())
          .filter(Boolean),
      ));
      if (lineColors.length > 1) {
        return `${lineColors.length}色：${lineColors.join(' / ')}`;
      }
      if (lineColors.length === 1) return lineColors[0];
      return String(color ?? (order as any)?.color ?? '').trim();
    }, [color, normalizedOrderLines, order]);

    const computedSizeItems = React.useMemo(() => {
      if (sizeItems) return sizeItems;
      const map = new Map<string, number>();
      normalizedOrderLines.forEach((l) => {
        const s = String(l.size || '').trim();
        if (!s) return;
        map.set(s, (map.get(s) || 0) + toNumberSafe(l.quantity));
      });
      const sizes = sortSizeNames(Array.from(map.keys()));
      return sizes.map((s) => ({ size: s, quantity: map.get(s) || 0 }));
    }, [sizeItems, normalizedOrderLines]);

    const computedTotal = React.useMemo(() => {
      if (typeof totalQuantity === 'number') return totalQuantity;
      if (computedSizeItems.length) {
        return computedSizeItems.reduce((sum, item) => sum + toNumberSafe(item.quantity), 0);
      }
      return toNumberSafe((order as any)?.orderQuantity);
    }, [totalQuantity, computedSizeItems, order]);

    const matrixItems = React.useMemo<CardSizeQuantityItem[]>(() => {
      if (normalizedOrderLines.length) {
        return normalizedOrderLines.map((line) => ({
          color: String(line?.color || '').trim(),
          size: String(line?.size || '').trim(),
          quantity: toNumberSafe(line?.quantity),
        }));
      }
      return computedSizeItems.map((item) => ({
        color: resolvedColor,
        size: String(item?.size || '').trim(),
        quantity: toNumberSafe(item?.quantity),
      }));
    }, [computedSizeItems, normalizedOrderLines, resolvedColor]);

    const cuttingMatrixItems = React.useMemo<CardSizeQuantityItem[]>(
      () => (cuttingSizeItems || []).map((item) => ({
        color: String(item?.color || '').trim() || '裁剪',
        size: String(item?.size || '').trim(),
        quantity: toNumberSafe(item?.quantity),
      })),
      [cuttingSizeItems],
    );

    const fields: OrderHeaderField[] = [
      ...(showOrderNo ? [{ label: '订单号', value: <span className="order-no-compact">{resolvedOrderNo || '-'}</span> } as OrderHeaderField] : []),
      { label: '款号', value: resolvedStyleNo || '-' },
      { label: '款名', value: resolvedStyleName || '-' },
      ...(showColor && (!hideEmptyColor || !!resolvedColor) ? [{ label: '颜色', value: resolvedColor || '-' } as OrderHeaderField] : []),
      { label: '下单数量', value: computedTotal > 0 ? `${computedTotal}` : '-' },
      ...(extraFields || []),
    ];
    const infoLabelStyle: React.CSSProperties = { fontSize: 'var(--font-size-sm)' };
    const infoValueStyle: React.CSSProperties = {
      fontSize: 'var(--font-size-md, 15px)',
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    };

    const hasRealSizeItems = computedSizeItems.some((item) => {
      const sizeText = String(item?.size || '').trim();
      return !!sizeText && sizeText !== '-';
    });

    return (
      <Row gutter={16} className={`purchase-detail-top${className ? ` ${className}` : ''}`}>
        <Col xs={24} md={8} lg={6}>
          <div className="purchase-detail-right">
            {coverNode || (
              <StyleCoverThumb
                styleId={resolvedStyleId}
                styleNo={resolvedStyleNo}
                src={resolvedCover}
                size={coverSize}
                borderRadius={8}
              />
            )}
          </div>
        </Col>
        <Col xs={24} md={16} lg={18}>
          <div className="purchase-detail-left">
            <OrderInfoGrid
              fontSize={14}
              rowGap={8}
              gap={12}
              items={[
                ...fields.map((field) => ({
                  label: field.label,
                  value: field.value,
                  labelStyle: infoLabelStyle,
                  valueStyle: infoValueStyle,
                })),
                ...((!hideSizeBlockWhenNoRealSize || hasRealSizeItems)
                  ? createOrderColorSizeMatrixInfoItems({
                      items: matrixItems,
                      fallbackColor: resolvedColor,
                      fallbackSize: computedSizeItems.map((item) => String(item?.size || '').trim()).filter(Boolean).join('/'),
                      fallbackQuantity: computedTotal,
                      totalLabel: '总下单数',
                      columnMinWidth: matrixColumnMinWidth,
                      gap: matrixGap,
                      fontSize: matrixFontSize,
                      labelStyle: infoLabelStyle,
                      valueStyle: infoValueStyle,
                    })
                  : []),
                ...(cuttingMatrixItems.length
                  ? createOrderColorSizeMatrixInfoItems({
                      items: cuttingMatrixItems,
                      totalLabel: '裁剪总数',
                      columnMinWidth: matrixColumnMinWidth,
                      gap: matrixGap,
                      fontSize: matrixFontSize,
                      labelStyle: infoLabelStyle,
                      valueStyle: infoValueStyle,
                    })
                  : []),
              ]}
            />
          </div>
        </Col>
      </Row>
    );
  };

export default ProductionOrderHeader;
