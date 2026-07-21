/**
 * 下单明细（颜色×尺码矩阵）区块
 * 提取自 index.tsx
 * 数据源：sizeColorConfig 解析后的矩阵
 */
import React from 'react';

interface SizeColorMatrixSectionProps {
  sizeColorMatrix: { sizes: string[]; matrixRows: Array<{ color: string; quantities: number[] }> } | null;
}

const SizeColorMatrixSection: React.FC<SizeColorMatrixSectionProps> = ({ sizeColorMatrix }) => {
  if (!sizeColorMatrix || sizeColorMatrix.sizes.length === 0) return null;
  return (
    <div className="print-section" style={{ padding: 16, border: '0.5px solid #d0d0d0', background: 'var(--color-bg-base)', borderRadius: 8, breakInside: 'avoid' }}>
      <div style={{ fontWeight: 600, color: '#333', marginBottom: 8, fontSize: 12, paddingBottom: 6, borderBottom: '0.75px solid #ccc' }}>下单明细</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="pt" style={{ breakInside: 'avoid' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: 100 }}>颜色/尺码</th>
              {sizeColorMatrix.sizes.map(s => <th key={s}>{s}</th>)}
              <th>合计</th>
            </tr>
          </thead>
          <tbody>
            {sizeColorMatrix.matrixRows.map((row, i) => {
              const rowTotal = row.quantities.reduce((s, q) => s + q, 0);
              return (
                <tr key={row.color || i}>
                  <td style={{ fontWeight: 500 }}>{row.color || '-'}</td>
                  {sizeColorMatrix.sizes.map((_, ci) => <td key={ci}>{row.quantities[ci] || 0}</td>)}
                  <td style={{ fontWeight: 600 }}>{rowTotal}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>合计</td>
              {sizeColorMatrix.sizes.map((_, ci) => <td key={ci}></td>)}
              <td className="highlight-cell">
                {sizeColorMatrix.matrixRows.reduce((s, r) => s + r.quantities.reduce((a, b) => a + b, 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SizeColorMatrixSection;
