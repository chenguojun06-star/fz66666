/**
 * 生产制单（生产要求）区块
 * 提取自 index.tsx
 */
import React from 'react';

interface ProductionSheetSectionProps {
  productionSheet: any;
}

/**
 * 防御性清洗（D-069 同规则）：剔除行首带 "[yyyy-MM-dd HH:mm:ss]" 时间戳的
 * 历史误写日志行。即使后端 Flyway 清洗脚本（V202708143000）尚未在目标环境执行，
 * 打印也不会带出污染内容；人工填写的生产要求文本不受影响。
 */
const stripOperationLogLines = (text: string): string =>
  text
    .split('\n')
    .filter((line) => !/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/.test(line.trim()))
    .join('\n')
    .trim();

const ProductionSheetSection: React.FC<ProductionSheetSectionProps> = ({ productionSheet }) => {
  const description = stripOperationLogLines(productionSheet?.description || '');
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
