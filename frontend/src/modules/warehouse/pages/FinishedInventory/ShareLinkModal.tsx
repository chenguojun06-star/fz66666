import React from 'react';
import { Modal, Button, Input, Typography, Spin } from 'antd';

interface ShareLinkModalProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  shareLoading: boolean;
  onCopy: () => void;
}

const ShareLinkModal: React.FC<ShareLinkModalProps> = ({ open, onClose, shareUrl, shareLoading, onCopy }) => (
  <Modal
    title="客户出货追踪链接"
    open={open}
    onCancel={onClose}
    width={480}
    footer={[
      <Button key="copy" type="primary" disabled={!shareUrl} onClick={onCopy}>复制链接</Button>,
      <Button key="close" onClick={onClose}>关闭</Button>,
    ]}
  >
    {shareLoading ? (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <Spin /> <span style={{ marginLeft: 8 }}>正在生成分享链接…</span>
      </div>
    ) : (
      <>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          将此链接发送给客户，客户可查看本次出货的款式、数量、物流等信息：
        </Typography.Paragraph>
        <Input.TextArea id="shareUrl" value={shareUrl} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />
      </>
    )}
  </Modal>
);

export default ShareLinkModal;
