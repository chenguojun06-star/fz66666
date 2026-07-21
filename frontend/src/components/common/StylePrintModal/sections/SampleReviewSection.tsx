/**
 * 样衣审核信息区块
 * 提取自 index.tsx
 */
import React from 'react';
import { formatDateTime } from '@/utils/datetime';

interface SampleReviewSectionProps {
  productionSheet: any;
}

const SampleReviewSection: React.FC<SampleReviewSectionProps> = ({ productionSheet }) => {
  const sampleReviewStatus = String(productionSheet?.sampleReviewStatus || '').trim().toUpperCase();
  const sampleReviewComment = String(productionSheet?.sampleReviewComment || '').trim();
  const sampleReviewer = String(productionSheet?.sampleReviewer || '').trim();
  const sampleReviewTime = productionSheet?.sampleReviewTime;
  const reviewLabel =
    sampleReviewStatus === 'PASS' ? '通过'
      : sampleReviewStatus === 'REWORK' ? '需修改'
        : sampleReviewStatus === 'REJECT' ? '不通过'
          : sampleReviewStatus === 'PENDING' ? '待审核'
            : '';
  return (
    <table className="pt" style={{ marginBottom: 12 }}>
      <tbody>
        <tr>
          <td className="label-cell">审核状态</td>
          <td>{reviewLabel || '-'}</td>
        </tr>
        <tr>
          <td className="label-cell">审核人</td>
          <td>{sampleReviewer || '-'}</td>
        </tr>
        <tr>
          <td className="label-cell">审核时间</td>
          <td>{sampleReviewTime ? formatDateTime(sampleReviewTime) : '-'}</td>
        </tr>
        {sampleReviewComment && (
          <tr>
            <td className="label-cell">审核评语</td>
            <td style={{ whiteSpace: 'pre-wrap' }}>{sampleReviewComment}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

export default SampleReviewSection;
