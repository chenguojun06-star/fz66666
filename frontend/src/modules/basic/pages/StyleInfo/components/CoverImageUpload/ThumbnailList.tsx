import React from 'react';
import { DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { DisplayImage } from './types';
import { resolveAssetMeta } from './helpers';

interface ThumbnailListProps {
  displayImages: DisplayImage[];
  currentIndex: number;
  hoverIndex: number | null;
  setHoverIndex: (v: number | null) => void;
  setCurrentIndex: (v: number) => void;
  isNewMode: boolean;
  enabled: boolean;
  coverUrl?: string | null;
  onSetCover: (index: number) => void;
  onDelete: (attachmentId: string | number, localIndex?: number) => void;
}

/**
 * 缩略图列表子组件
 * hover 时显示设为主图 / 删除按钮
 */
const ThumbnailList: React.FC<ThumbnailListProps> = ({
  displayImages,
  currentIndex,
  hoverIndex,
  setHoverIndex,
  setCurrentIndex,
  isNewMode,
  enabled,
  coverUrl,
  onSetCover,
  onDelete,
}) => {
  if (displayImages.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, width: '100%', maxWidth: 400, marginBottom: 6 }}>
      {displayImages.map((img, idx) => {
        const hover = hoverIndex === idx;
        const canOperate = isNewMode || enabled;
        const isCoverFallback = !!(img as { isCoverFallback?: boolean })?.isCoverFallback;
        const assetMeta = resolveAssetMeta(img, idx, coverUrl, isNewMode, currentIndex);
        return (
          <div
            key={idx}
            onMouseEnter={() => setHoverIndex(idx)}
            onMouseLeave={() => setHoverIndex(null)}
            style={{
              width: '100%',
              aspectRatio: '1 / 1',
              border: currentIndex === idx ? '2px solid var(--color-warning)' : '1px solid var(--color-border-antd)',
              borderRadius: 6,
              overflow: 'hidden',
              position: 'relative',
              cursor: (isNewMode || enabled) ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-border-light)',
            }}
          >
            <img
              src={getFullAuthedFileUrl(img.fileUrl)}
              alt={assetMeta.label}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onClick={() => setCurrentIndex(idx)}
            />
            {/* Hover显示操作按钮（兜底参考图不可编辑） */}
            {hover && canOperate && !isCoverFallback && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 6,
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetCover(idx);
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: currentIndex === idx ? 'var(--color-warning)' : 'var(--color-bg-base)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="设置为主图"
                >
                  {currentIndex === idx ? (
                    <StarFilled style={{ color: 'var(--neutral-white)', fontSize: 12 }} />
                  ) : (
                    <StarOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
                  )}
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(img.id, img.localIndex);
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--color-bg-base)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="删除图片"
                >
                  <DeleteOutlined style={{ color: 'var(--color-danger)', fontSize: 12 }} />
                </div>
              </div>
            )}
            {/* 主图/参考图小标记 */}
            <div
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                background: assetMeta.color,
                color: 'var(--neutral-white)',
                fontSize: 9,
                padding: '1px 4px',
                borderRadius: 2,
              }}
            >
              {assetMeta.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ThumbnailList;
