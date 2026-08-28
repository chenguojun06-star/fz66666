import React from 'react';
import { sanitizeSheetRichHtml, isSheetRichHtml } from '@/utils/sheetRichText';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface ProductionSheetSectionProps {
  productionSheet: any;
}

const ProductionSheetSection: React.FC<ProductionSheetSectionProps> = ({ productionSheet }) => {
  const rawDescription = String(productionSheet?.description || '');
  const description = sanitizeSheetRichHtml(
    stripOperationLogLines(rawDescription),
    {
      imgStyle: 'max-width:100%;width:240px;object-fit:contain;border:1px solid var(--color-border-light, rgba(0,0,0,0.1));border-radius:6px;display:block;margin:6px 0',
      resolveUrl: (u) => /^https?:\/\//i.test(u) ? u : getFullAuthedFileUrl(u),
    }
  );
  const rich = isSheetRichHtml(rawDescription);
  return (
    <table className="pt" style={{ marginBottom: 12 }}>
      <tbody>
        <tr>
          <td className="label-cell">工艺说明</td>
          <td style={{ whiteSpace: rich ? 'normal' : 'pre-wrap', minHeight: 40 }}>
            {description ? (
              rich ? (
                <div dangerouslySetInnerHTML={{ __html: description }} />
              ) : (
                description
              )
            ) : '-'}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

/**
 * 防御性清洗（D-069 同规则）：剔除行首带 "[yyyy-MM-dd HH:mm:ss]" 时间戳的历史误写日志行，
 * 人工填写的生产要求文本（含内嵌图片 HTML）不受影响。
 */
function stripOperationLogLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/.test(line.trim()))
    .join('\n')
    .trim();
}

export default ProductionSheetSection;
