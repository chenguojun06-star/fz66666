import React from 'react';
import { Button } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import ResizableModal from './ResizableModal';

interface ImagePreviewModalProps {
  open: boolean;
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

/**
 * 图片预览弹窗（公共组件）
 * 自动根据图片实际宽高比计算弹窗尺寸，横图宽一点、竖图高一点。
 *
 * 使用位置：
 * - 成品入库详情
 * - 成品入库列表
 * - 其他需要图片预览的页面
 */
const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  open,
  imageUrl,
  title = '图片预览',
  onClose,
}) => {
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

  // 关闭时重置尺寸，避免下次打开闪烁
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
      destroyOnHidden
    >
      {imageUrl ? (
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
            src={getFullAuthedFileUrl(imageUrl)}
            alt={title}
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

export default ImagePreviewModal;
