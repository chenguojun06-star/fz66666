import React from 'react';
import { Button, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { withQuery } from '@/utils/api/core';
import { reviewStatusTag } from './helpers';

interface Props {
  styleId: string | number;
  styleNo?: string;
  sampleCompleted?: boolean;
  sampleReviewStatus?: string | null;
  sampleReviewComment?: string | null;
  sampleReviewer?: string | null;
  sampleReviewTime?: string | null;
  productionCompletedTime?: string;
  completedTime?: string | null;
  styleName?: string;
  color?: string;
  size?: string;
  sampleQuantity?: number;
  onOpenReviewModal: () => void;
}

const SampleReviewSection: React.FC<Props> = ({
  styleId,
  styleNo,
  sampleCompleted,
  sampleReviewStatus,
  sampleReviewComment,
  sampleReviewer,
  sampleReviewTime,
  productionCompletedTime,
  completedTime,
  styleName,
  color,
  size,
  sampleQuantity,
  onOpenReviewModal,
}) => {
  const navigate = useNavigate();

  return (
    <div style={{
      border: '1px solid var(--color-border, var(--color-border))',
      borderRadius: 6,
      padding: '12px 16px',
      marginBottom: 16,
      background: sampleReviewStatus === 'PASS'
        ? 'rgba(82,196,26,0.04)'
        : sampleReviewStatus === 'REWORK'
          ? 'rgba(250,173,20,0.05)'
          : sampleReviewStatus === 'REJECT'
            ? 'rgba(255,77,79,0.04)'
            : 'var(--color-bg-card, var(--color-bg-container))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: sampleReviewStatus ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, paddingLeft: 10, borderLeft: '3px solid var(--color-primary)' }}>样衣审核</span>
          {reviewStatusTag(sampleReviewStatus)}
          {!sampleReviewStatus && !sampleCompleted && !productionCompletedTime && (
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
              （样衣生产完成后可记录审核结论）
            </span>
          )}
        </div>
        <Space size={8}>
          {(sampleCompleted || !!productionCompletedTime) && (
            <Button onClick={onOpenReviewModal}>
              {sampleReviewStatus ? '修改审核结论' : '记录审核结论'}
            </Button>
          )}
          {sampleReviewStatus === 'PASS' && !completedTime && (
            <Button
               
              type="primary"
              onClick={() => navigate(withQuery('/warehouse/sample', {
                styleId: String(styleId),
                styleNo: styleNo || '',
                action: 'inbound',
                styleName: styleName || '',
                color: color || '',
                size: size || '',
                quantity: sampleQuantity != null ? String(sampleQuantity) : '',
                sampleType: 'development',
              }))}
            >
              样衣入库
            </Button>
          )}
        </Space>
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-secondary)', lineHeight: '1.8', marginBottom: sampleReviewStatus ? 8 : 0 }}>
        审核通过只代表样衣确认通过，完成入库后才算样衣闭环。
      </div>
      {sampleReviewStatus && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-secondary)', lineHeight: '1.8' }}>
          {sampleReviewer && <span style={{ marginRight: 16 }}>审核人：<span style={{ color: 'var(--neutral-text)' }}>{sampleReviewer}</span></span>}
          {sampleReviewTime && <span>时间：<span style={{ color: 'var(--neutral-text)' }}>{String(sampleReviewTime).replace('T', ' ').slice(0, 16)}</span></span>}
          {sampleReviewComment && (
            <div style={{ marginTop: 4, color: 'var(--neutral-text)', whiteSpace: 'pre-wrap' }}>
              评语：{sampleReviewComment}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SampleReviewSection;
