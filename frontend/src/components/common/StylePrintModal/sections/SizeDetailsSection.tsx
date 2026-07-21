/**
 * 码数明细区块（基于 sizeDetails 数组）
 * 提取自 index.tsx
 * 数据源：sizeDetails prop（颜色×码数×数量扁平数组）
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
  sizeDetails.forEach(d => { if (!dataMap[d.size]) dataMap[d.size] = {}; dataMap[d.size][d.color] = (dataMap[d.size][d.color] || 0) + d.quantity; });
  const grandTotal = sizeDetails.reduce((sum, d) => sum + d.quantity, 0);
  return (
    <div className="print-section" style={{ padding: 16, border: '0.5px solid #d0d0d0', background: 'var(--color-bg-base)', borderRadius: 8, breakInside: 'avoid', marginBottom: 12 }}>
      <div style={{ fontWeight: 600, color: '#333', marginBottom: 8, fontSize: 12, paddingBottom: 6, borderBottom: '0.75px solid #ccc' }}>下单明细</div>
      <table className="pt">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', width: 60 }}>颜色</th>
            {colors.map(color => <th key={color}>{color}</th>)}
            <th style={{ width: 80 }}>合计</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="label-cell">尺码</td>
            {colors.map(color => <td key={color}>{sizes.join(' / ')}</td>)}
            <td>-</td>
          </tr>
          <tr>
            <td className="label-cell">数量</td>
            {colors.map(color => <td key={color}>{sizes.map(size => dataMap[size]?.[color] || 0).join(' / ')}</td>)}
            <td style={{ fontWeight: 600 }}>{grandTotal}</td>
          </tr>
          <tr className="total-row">
            <td>合计</td>
            {colors.map(color => <td key={color}></td>)}
            <td className="highlight-cell">{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default SizeDetailsSection;
