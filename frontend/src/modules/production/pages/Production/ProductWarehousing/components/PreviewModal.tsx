import React from 'react';
import { Button } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import ResizableModal from '@/components/common/ResizableModal';

interface PreviewModalProps {
  open: boolean;
  url: string;
  title: string;
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ open, url, title, onClose }) => {
  return (
    <ResizableModal
      open={open}
      title={title}
      footer={
        <div className="modal-footer-actions">
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
      onCancel={onClose}
      width={600}
      minWidth={600}
      minHeight={600}
      initialHeight={600}
      autoFontSize={false}
    >
      {url ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img
            src={getFullAuthedFileUrl(url)}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      ) : null}
    </ResizableModal>
  );
};

export default PreviewModal;
