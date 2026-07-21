import React from 'react';
import { Card, Image, Space, Spin, Tooltip } from 'antd';
import { FileImageOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { PurchaseDocRecord } from '../PurchaseDetailView.helpers';

interface PurchaseDocHistoryCardProps {
  docList: PurchaseDocRecord[];
  docsLoading: boolean;
}

// 历史上传单据 Card
const PurchaseDocHistoryCard: React.FC<PurchaseDocHistoryCardProps> = ({ docList, docsLoading }) => {
  if (docList.length === 0 && !docsLoading) return null;

  return (
    <Card
      style={{ marginTop: 12 }}
      title={
        <Space>
          <FileImageOutlined />
          <span>历史上传单据</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>（{docList.length}张）</span>
        </Space>
      }
    >
      <Spin spinning={docsLoading}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {docList.map((doc) => (
            <div
              key={doc.id}
              style={{
                width: 160,
                border: '1px solid var(--color-border-light)',
                borderRadius: 6,
                padding: 8,
                background: 'var(--color-bg-container)',
              }}
            >
              <Image
                src={getFullAuthedFileUrl(doc.imageUrl)}
                width={144}
                height={100}
                style={{ objectFit: 'cover', borderRadius: 4 }}
                preview={{ cover: '预览' }}
              />
              <div style={{ marginTop: 6, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                <Tooltip title={doc.uploaderName}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.uploaderName || '未知'}
                  </div>
                </Tooltip>
                <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {doc.createTime ? doc.createTime.slice(0, 16).replace('T', ' ') : ''}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  识别{doc.totalRecognized}条 · 匹配{doc.matchCount}条
                </div>
              </div>
            </div>
          ))}
        </div>
      </Spin>
    </Card>
  );
};

export default PurchaseDocHistoryCard;
