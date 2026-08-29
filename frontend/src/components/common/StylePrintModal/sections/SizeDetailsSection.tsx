/**
 * 码数明细区块（基于 sizeDetails 数组）
 * 提取自 index.tsx
 * 数据源：sizeDetails prop（颜色×码数×数量扁平数组）
 * D-220：改为颜色(行)×码数(列)对齐矩阵表——原实现把尺码/数量斜杠拼接挤成两行，不工整
 */
import React from 'react';

interface SizeDetailsSectionProps {
  sizeDetails: Array<{ color: string; size: string; quantity: number }>;
}

const SizeDetailsSection: React.FC<SizeDetailsSectionProps> = ({ sizeDetails }) => {
  if (!sizeDetails || sizeDetails.length === 0) return null;
  const colors = [...new Set(sizeDetails.map(d => d.color))];
  const sizes = [...new Set(sizeDetails.map(d => d.size))];
  const dataMap: Record<string, Record<string, number>> = {};
  sizeDetails.forEach(d => {
    if (!dataMap[d.color]) dataMap[d.color] = {};
    dataMap[d.color][d.size] = (dataMap[d.color][d.size] || 0) + d.quantity;
  });
  const colTotals: Record<string, number> = {};
  sizeDetails.forEach(d => { colTotals[d.size] = (colTotals[d.size] || 0) + d.quantity; });
  const grandTotal = sizeDetails.reduce((sum, d) => sum + d.quantity, 0);
  return (
    <div className="print-section" style={{ padding: 16, border: '0.5px solid var(--color-zinc-300)', background: 'var(--color-bg-base)', borderRadius: 8, breakInside: 'avoid', marginBottom: 12 }}>
      <div style={{ fontWeight: 600, color: 'var(--color-gray-800)', marginBottom: 8, fontSize: 12, paddingBottom: 6, borderBottom: '0.75px solid var(--color-text-quaternary)' }}>下单明细</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="pt" style={{ breakInside: 'avoid' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: 100 }}>颜色/尺码</th>
              {sizes.map(s => <th key={s}>{s}</th>)}
              <th>合计</th>
            </tr>
          </thead>
          <tbody>
            {colors.map(color => {
              const rowTotal = sizes.reduce((sum, s) => sum + (dataMap[color]?.[s] || 0), 0);
              return (
                <tr key={color}>
                  <td style={{ fontWeight: 500 }}>{color || '-'}</td>
                  {sizes.map(s => <td key={s}>{dataMap[color]?.[s] || 0}</td>)}
                  <td style={{ fontWeight: 600 }}>{rowTotal}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>合计</td>
              {sizes.map(s => <td key={s} style={{ fontWeight: 600 }}>{colTotals[s] || 0}</td>)}
              <td className="highlight-cell">{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SizeDetailsSection;
