import React from 'react';
import { Typography } from 'antd';
import SheetRichViewer from '@/components/common/SheetRichViewer';
import { formatDateTime } from '@/utils/datetime';

const { Title } = Typography;

interface Props {
  description: string;
  reviewStatus?: string;
  reviewComment?: string;
  reviewer?: string;
  reviewTime?: string;
}

/**
 * 工艺说明 Tab（D-187 前叫"生产制单/生产要求"）：
 * 只读展示样衣开发端编辑的富文本工艺说明（style.description），
 * 历史日志脏行由 sheetRichText 统一剥离，不再按行拆表格。
 */
const ProductionSheetPanel: React.FC<Props> = ({
  description, reviewStatus, reviewComment, reviewer, reviewTime,
}) => {
  const desc = String(description || '').trim();

  const status = String(reviewStatus || '').trim().toUpperCase();
  const comment = String(reviewComment || '').trim();
  const by = String(reviewer || '').trim();
  const time = String(reviewTime || '').trim();
  const reviewLabel =
    status === 'PASS' ? '通过'
      : status === 'REWORK' ? '需修改'
        : status === 'REJECT' ? '不通过'
          : status === 'PENDING' ? '待审核'
            : '';

  return (
    <div style={{ padding: '8px 0' }}>
      {(reviewLabel || comment || by || time) && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          border: '1px solid var(--neutral-border, var(--color-border-light))',
          borderRadius: 6,
          background: 'var(--neutral-bg, var(--color-bg-container))',
          fontSize: 14,
          lineHeight: '20px',
        }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>样衣审核</div>
          <div>
            <span>审核状态：{reviewLabel || '-'}</span>
            <span style={{ marginLeft: 16 }}>审核人：{by || '-'}</span>
            <span style={{ marginLeft: 16 }}>审核时间：{time ? formatDateTime(time) : '-'}</span>
          </div>
          {comment && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>审核评语：{comment}</div>}
        </div>
      )}
      <Title level={5} style={{ marginBottom: 12 }}>工艺说明</Title>
      <SheetRichViewer content={desc} />
    </div>
  );
};

export default ProductionSheetPanel;
