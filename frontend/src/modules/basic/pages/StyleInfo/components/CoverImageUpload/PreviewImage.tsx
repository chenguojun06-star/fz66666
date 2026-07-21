import React from 'react';
import { Image } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { DisplayImage } from './types';

interface PreviewImageProps {
  currentImage: DisplayImage | undefined;
  coverUrl?: string | null;
  isNewMode: boolean;
  styleId?: string | number;
  enabled: boolean;
  displayImages: DisplayImage[];
  currentIndex: number;
  previewHovered: boolean;
  setPreviewHovered: (v: boolean) => void;
  setCurrentIndex: (v: number) => void;
  currentAssetMetaLabel: string;
}

/**
 * 大图预览子组件
 * 保持干净，只在左上角显示资产类型徽标；多图时 hover 显示左右切换
 */
const PreviewImage: React.FC<PreviewImageProps> = ({
  currentImage,
  coverUrl,
  isNewMode,
  styleId,
  enabled,
  displayImages,
  currentIndex,
  previewHovered,
  setPreviewHovered,
  setCurrentIndex,
  currentAssetMetaLabel,
}) => {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        overflow: 'hidden',
        background: 'var(--color-bg-container)',
        cursor: 'default',
        position: 'relative',
      }}
      onMouseEnter={() => displayImages.length > 1 && setPreviewHovered(true)}
      onMouseLeave={() => setPreviewHovered(false)}
    >
      {currentImage ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <Image loading="lazy" src={getFullAuthedFileUrl(currentImage.fileUrl)} alt="主图" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* 左上角：资产类型徽标（唯一一个常驻徽标） */}
          <div style={{ position: 'absolute', left: 10, top: 10, padding: '3px 10px', borderRadius: 999, background: 'rgba(37, 99, 235, 0.9)', color: 'var(--color-bg-base)', fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>
            {currentAssetMetaLabel}
          </div>
        </div>
      ) : coverUrl ? (
        <Image loading="lazy" src={getFullAuthedFileUrl(coverUrl)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 16px', width: '100%' }}>
          {isNewMode ? (
            <>
              <div style={{ color: 'var(--color-primary)', fontSize: 13, fontWeight: 600 }}>上传设计稿或款式照片</div>
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginTop: 4 }}>
                支持拖拽上传，可自动识别填充
              </div>
            </>
          ) : !styleId ? (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>请先保存基础信息后再上传图片</div>
          ) : enabled ? (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>上传设计稿或款式照片</span>
          ) : (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>样衣已完成，如需修改请联系管理员</div>
          )}
        </div>
      )}
      {displayImages.length > 1 && previewHovered && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex <= 0 ? displayImages.length - 1 : currentIndex - 1); }}
            style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 56, background: 'rgba(17, 24, 39, 0.5)',
              borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(17, 24, 39, 0.75)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(17, 24, 39, 0.5)'; }}
          >
            <LeftOutlined style={{ color: 'var(--color-bg-base)', fontSize: 14 }} />
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex >= displayImages.length - 1 ? 0 : currentIndex + 1); }}
            style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 56, background: 'rgba(17, 24, 39, 0.5)',
              borderRadius: '8px 0 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(17, 24, 39, 0.75)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(17, 24, 39, 0.5)'; }}
          >
            <RightOutlined style={{ color: 'var(--color-bg-base)', fontSize: 14 }} />
          </div>
        </>
      )}
    </div>
  );
};

export default PreviewImage;
