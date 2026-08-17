/**
 * 生产制单（生产要求）区块
 * 提取自 index.tsx
 */
import React from 'react';
import { Image } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface ProductionSheetSectionProps {
  productionSheet: any;
  /** 附件列表（含 bizType=workorder 的制单图片，与详情页工艺制单一致） */
  attachments?: any[];
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

const ProductionSheetSection: React.FC<ProductionSheetSectionProps> = ({ productionSheet, attachments = [] }) => {
  const description = stripOperationLogLines(productionSheet?.description || '');
  // 制单图片：bizType=workorder 的图片附件（与详情页工艺制单上传的一致）
  const isImageFile = (ft: unknown) => {
    const s = String(ft || '').toLowerCase();
    return s.includes('image') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(s) || /^(png|jpe?g|gif|webp|bmp|svg)$/.test(s);
  };
  const sheetImages = attachments
    .filter((a: any) => String(a?.bizType || '') === 'workorder' && isImageFile(a?.fileType))
    .map((a: any) => String(a.fileUrl || ''))
    .filter(Boolean);
  return (
    <>
      <table className="pt" style={{ marginBottom: sheetImages.length ? 0 : 12 }}>
        <tbody>
          <tr>
            <td className="label-cell">生产要求</td>
            <td style={{ whiteSpace: 'pre-wrap', minHeight: 40 }}>{description || '-'}</td>
          </tr>
        </tbody>
      </table>
      {sheetImages.length > 0 && (
        <table className="pt" style={{ marginBottom: 12 }}>
          <tbody>
            <tr>
              <td className="label-cell">制单图片</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sheetImages.map((url: string) => (
                    <Image
                      key={url}
                      src={getFullAuthedFileUrl(url)}
                      style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--color-border-light)' }}
                      preview={{ cover: <span>预览</span> }}
                    />
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
};

export default ProductionSheetSection;
