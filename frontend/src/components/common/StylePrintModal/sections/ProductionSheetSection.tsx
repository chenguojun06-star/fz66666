/**
 * 生产制单（生产要求）区块
 * 提取自 index.tsx
 */
import React from 'react';

interface ProductionSheetSectionProps {
  productionSheet: any;
}

const ProductionSheetSection: React.FC<ProductionSheetSectionProps> = ({ productionSheet }) => {
  const description = productionSheet?.description || '';
  return (
    <table className="pt" style={{ marginBottom: 12 }}>
      <tbody>
        <tr>
          <td className="label-cell">生产要求</td>
          <td style={{ whiteSpace: 'pre-wrap', minHeight: 40 }}>{description || '-'}</td>
        </tr>
      </tbody>
    </table>
  );
};

export default ProductionSheetSection;
