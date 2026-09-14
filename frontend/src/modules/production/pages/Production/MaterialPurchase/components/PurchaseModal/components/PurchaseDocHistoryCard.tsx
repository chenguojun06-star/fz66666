import React from 'react';
import { Card, Empty, Image, Space, Spin, Tooltip } from 'antd';
import { FileImageOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { PurchaseDocRecord } from '../PurchaseDetailView.helpers';

interface PurchaseDocHistoryCardProps {
  docList: PurchaseDocRecord[];
  docsLoading: boolean;
}

// 历史上传单据 Card
const PurchaseDocHistoryCard: React.FC<PurchaseDocHistoryCardProps> = ({ docList, docsLoading }) => {
  // D-360d：空态不再整卡隐藏——用户不知道单据存哪/在哪看，给出明确指引
  if (docList.length === 0 && !docsLoading) {
    return (
      <Card
        className="u-mt-12"
        title={<Space><FileImageOutlined /><span>历史上传单据</span></Space>}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无采购单据。在「物料采购明细」页点「上传采购单」上传供应商送货单，上传即自动保存在这里（按订单关联，可随时回看）。"
        />
      </Card>
    );
  }

  return (
    <Card
      className="u-mt-12"
      title={
        <Space>
          <FileImageOutlined />
          <span>历史上传单据</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>（{docList.length}张）</span>
        </Space>
      }
    >
      <Spin spinning={docsLoading}>
        <div className="u-d-flex u-fwrap-wrap u-gap-16">
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
                className="u-objf-cover u-br-4"
                preview={{ cover: '预览' }}
              />
              <div className="u-mt-6 u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>
                <Tooltip title={doc.uploaderName}>
                  <div className="u-ov-hidden u-ws-nowrap" style={{ textOverflow: 'ellipsis' }}>
                    {doc.uploaderName || '未知'}
                  </div>
                </Tooltip>
                <div className="u-mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  {doc.createTime ? doc.createTime.slice(0, 16).replace('T', ' ') : ''}
                </div>
                <div className="u-mt-2" style={{ color: 'var(--color-text-secondary)' }}>
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
