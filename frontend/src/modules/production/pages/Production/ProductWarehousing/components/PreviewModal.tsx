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
  const [modalSize, setModalSize] = React.useState<{ width: number; height: number }>({ width: 480, height: 480 });

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return;

    const maxWidth = 600;
    const maxHeight = 600;
    const minSize = 300;

    let w = naturalWidth;
    let h = naturalHeight;

    if (w > maxWidth || h > maxHeight) {
      const ratio = Math.min(maxWidth / w, maxHeight / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    w = Math.max(w, minSize);
    h = Math.max(h, minSize);

    setModalSize({ width: w, height: h });
  };

  React.useEffect(() => {
    if (!open) setModalSize({ width: 480, height: 480 });
  }, [open]);

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
      width={modalSize.width}
      minWidth={300}
      minHeight={300}
      initialHeight={modalSize.height}
      contentPadding={0}
      autoFontSize={false}
      destroyOnHidden
    >
      {url ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: '#f0f0f0',
          }}
        >
          <img
            src={getFullAuthedFileUrl(url)}
            alt=""
            onLoad={handleImageLoad}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
      ) : null}
    </ResizableModal>
  );
};

export default PreviewModal;
