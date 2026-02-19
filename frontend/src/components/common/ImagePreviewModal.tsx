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
    >
      {imageUrl ? (
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
            src={getFullAuthedFileUrl(imageUrl)}
            alt={title}
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

export default ImagePreviewModal;
