import React from 'react';
import { Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';

const { Title } = Typography;

interface Props {
  description: string;
  reviewStatus?: string;
  reviewComment?: string;
  reviewer?: string;
  reviewTime?: string;
}

const ProductionSheetPanel: React.FC<Props> = ({
  description, reviewStatus, reviewComment, reviewer, reviewTime,
}) => {
  const desc = String(description || '').trim();
  if (!desc) {
    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)' }}>
          暂无生产制单数据
        </div>
      </div>
    );
  }

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
  const rawLines = desc.split(/\r?\n/).map(s => s.replace(/^\d+[.、\s]+/, '').trim()).filter(Boolean);
  const fixedRows = Array.from({ length: Math.max(15, rawLines.length) }, (_, i) => ({
    key: i, seq: i + 1, content: rawLines[i] || '',
  }));

  return (
    <div style={{ padding: '8px 0' }}>
      {(reviewLabel || comment || by || time) && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          border: '1px solid var(--neutral-border, #e8e8e8)',
          borderRadius: 6,
          background: 'var(--neutral-bg, #fafafa)',
          fontSize: 12,
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
      <Title level={5} style={{ marginBottom: 12 }}>生产要求</Title>
      <ResizableTable
        size="small" rowKey="key" pagination={false}
        resizableColumns={false}
        dataSource={fixedRows}
        columns={[
          {
            title: '内容',
            dataIndex: 'content',
            key: 'content',
            align: 'left' as const,
            onHeaderCell: () => ({ style: { textAlign: 'left' as const } }),
            onCell: () => ({ style: { textAlign: 'left' as const } }),
            render: (text: string) => (
              <span style={{ whiteSpace: 'pre-wrap', display: 'block', textAlign: 'left' }}>{text}</span>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProductionSheetPanel;
