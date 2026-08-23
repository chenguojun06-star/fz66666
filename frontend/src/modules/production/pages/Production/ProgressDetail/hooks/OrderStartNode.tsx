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
  const styleNoText = String(record.styleNo || '').trim();
  const styleNameText = String((record as Record<string, unknown>).styleName || '').trim();
  const styleFullText = styleNameText ? `${styleNoText} · ${styleNameText}` : styleNoText;
  const skcText = String((record as Record<string, unknown>).skc || '').trim();
  const expectedShipRaw = (record as Record<string, unknown>).expectedShipDate;
  const expectedShipText = expectedShipRaw ? displayDate(String(expectedShipRaw), 'datetime') : '';
  const hasExtraInfo = Boolean(styleFullText || skcText || expectedShipText);

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
  const nodeColor = isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-text-tertiary)' : 'var(--color-success)');
  const nodeColor2 = isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-border)' : 'var(--color-success)');

  // 悬浮内容：订单次要信息（款号/SKC/预计交期）+ 颜色码数矩阵
  const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
  };
  const infoLabelStyle: React.CSSProperties = {
    color: 'var(--color-slate-400)',
    flexShrink: 0,
  };
  const popoverContent = (
    <div style={{ minWidth: 160 }}>
      {hasExtraInfo && (
        <div style={{ marginBottom: 8 }}>
          {styleFullText ? (
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>款号</span>
              <span style={{ fontWeight: 600 }}>{styleFullText}</span>
            </div>
          ) : null}
          {skcText ? (
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>SKC</span>
              <span>{skcText}</span>
            </div>
          ) : null}
          {expectedShipText ? (
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>预计交期</span>
              <span>{expectedShipText}</span>
            </div>
          ) : null}
        </div>
      )}
      <ColorSizeMatrixPopoverContent model={orderMatrix} />
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 0' }}>
      <Popover
        content={popoverContent}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        overlayStyle={{ minWidth: 180, maxWidth: 560 }}
        open={hasExtraInfo || orderMatrix.hasData ? undefined : false}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 78,
          flex: '0 0 auto',
          justifyContent: 'center',
          position: 'relative',
          cursor: hasExtraInfo || orderMatrix.hasData ? 'pointer' : 'default',
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
