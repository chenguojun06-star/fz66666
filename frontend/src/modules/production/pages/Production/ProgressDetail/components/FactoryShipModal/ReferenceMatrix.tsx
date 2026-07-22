import React from 'react';
import { thStyle, tdStyle } from './styles';
import type { ProductionOrder } from '@/types/production';
import type { ShippedDetailSum } from '@/services/production/factoryShipmentApi';
import { parseProductionOrderLines } from '@/utils/api';

interface ReferenceMatrixProps {
  orderRecord: ProductionOrder | null | undefined;
  detailSum: ShippedDetailSum[];
  allSizes: string[];
}

const ReferenceMatrix: React.FC<ReferenceMatrixProps> = ({ orderRecord, detailSum, allSizes }) => {
  const orderLines = parseProductionOrderLines(orderRecord);

  const refColors = React.useMemo(() => {
    const fromSum = detailSum.map(r => r.color);
    const fromOrder = orderLines.map(l => l.color).filter(Boolean);
    return [...new Set([...fromOrder, ...fromSum])];
  }, [detailSum, orderLines]);

  const getShipped = (color: string, size: string) => {
    const row = detailSum.find(r => r.color === color);
    if (!row) return 0;
    const sizeEntry = row.sizes.find(s => s.sizeName === size);
    return sizeEntry?.quantity ?? 0;
  };

  const getOrdered = (color: string, size: string) => {
    const line = orderLines.find(l => l.color === color && l.size === size);
    return line?.quantity ?? 0;
  };

  const hasMatrix = allSizes.length > 0 && refColors.length > 0;

  if (!hasMatrix) return null;

  return (
    <>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        下单与已发明细参考
        <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
          （格式：下单数 / <span style={{ color: '#096dd9' }}>已发数</span>）
        </span>
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-container)' }}>
              <th style={thStyle}>颜色</th>
              {allSizes.map(sz => (
                <th key={sz} style={thStyle}>{sz}</th>
              ))}
              <th style={thStyle}>合计(下单)</th>
            </tr>
          </thead>
          <tbody>
            {refColors.map(color => {
              const rowTotal = orderLines.filter(l => l.color === color).reduce((s, l) => s + (l.quantity || 0), 0);
              return (
                <tr key={color}>
                  <td style={tdStyle}><b>{color}</b></td>
                  {allSizes.map(sz => {
                    const ordered = getOrdered(color, sz);
                    const shipped = getShipped(color, sz);
                    return (
                      <td key={sz} style={tdStyle}>
                        {ordered > 0 ? ordered : '-'}
                        {shipped > 0 && (
                          <span style={{ color: '#096dd9', marginLeft: 3 }}>/{shipped}</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{rowTotal || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ReferenceMatrix;
