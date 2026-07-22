import React from 'react';
import { Popover } from 'antd';
import { buildOrderColorSizeMatrixModel, ColorSizeMatrixPopoverContent } from '@/components/common/OrderColorSizeMatrix';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import { displayDate } from '@/utils/display';
import { parseProductionOrderLines } from '@/utils/api/production';
import { ProductionOrder } from '@/types/production';
import { colorWithAlpha } from './cellRendererHelpers';

interface OrderStartNodeProps {
  record: ProductionOrder;
  totalQty: number;
  frozen: boolean;
  isCompletedOrClosed: boolean;
}

export function OrderStartNode({ record, totalQty, frozen, isCompletedOrClosed }: OrderStartNodeProps) {
  const orderLines = parseProductionOrderLines(record);
  let matrixItems = orderLines.map(item => ({
    color: String(item.color || '').trim(),
    size: String(item.size || '').trim(),
    quantity: Number(item.quantity || 0),
  }));
  if (matrixItems.length === 1) {
    const single = matrixItems[0];
    const clrArr = single.color.split(/[,，/]+/).map(s => s.trim()).filter(Boolean);
    const sizeArr = single.size.split(/[,，/、\s]+/).map(s => s.trim()).filter(Boolean);
    if (clrArr.length > 1 || sizeArr.length > 1) {
      const clrs = clrArr.length > 0 ? clrArr : [single.color];
      const sizes = sizeArr.length > 0 ? sizeArr : [single.size];
      const qtyEach = Math.round(single.quantity / (clrs.length * sizes.length));
      matrixItems = clrs.flatMap(c => sizes.map(s => ({ color: c, size: s, quantity: qtyEach })));
    }
  }
  const orderMatrix = buildOrderColorSizeMatrixModel({
    items: matrixItems,
    fallbackColor: String(record.color || '').trim(),
    fallbackSize: String(record.size || '').trim(),
    fallbackQuantity: totalQty,
  });
  const matrixPopoverContent = <ColorSizeMatrixPopoverContent model={orderMatrix} />;
  const nodeColor = isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-text-tertiary)' : 'var(--color-success)');
  const nodeColor2 = isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : '#95de64');

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 0' }}>
      <Popover
        content={matrixPopoverContent}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        overlayStyle={{ maxWidth: 320 }}
        open={orderMatrix.hasData ? undefined : false}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 78,
          flex: '0 0 auto',
          justifyContent: 'center',
          position: 'relative',
          cursor: orderMatrix.hasData ? 'pointer' : 'default',
        }}>
          <LiquidProgressLottie progress={100} size={68} nodeName="下单"
            paused={frozen} color1={nodeColor} color2={nodeColor2} />
          <div style={{
            position: 'absolute',
            top: 'calc(50% + 39px)',
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}>
            <div style={{
              fontSize: 12,
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              lineHeight: 1.2,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}>
              下单
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              fontWeight: 400,
              lineHeight: 1.2,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}>
              {displayDate(record.createTime, 'month-day')}
            </div>
          </div>
        </div>
      </Popover>
      <div style={{ flex: 1, alignSelf: 'center', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2, minWidth: 16 }}>
        <div style={{ flex: 1, position: 'relative', height: 1, borderRadius: 999,
          background: colorWithAlpha(nodeColor2, 0.28), overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 999,
            background: nodeColor, transition: 'width 0.25s ease' }} />
        </div>
      </div>
    </div>
  );
}
