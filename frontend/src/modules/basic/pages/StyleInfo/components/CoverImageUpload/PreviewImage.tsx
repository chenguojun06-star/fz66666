import { LeftOutlined, RightOutlined, ZoomInOutlined } from '@ant-design/icons';
import { Image } from 'antd';
import type { CSSProperties } from 'react';
import type { DisplayImage } from './types';

export interface PreviewImageProps {
  record?: DisplayImage;
  assetMeta: { label: string; color: string };
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  total: number;
  previewHovered: boolean;
  setPreviewHovered: (v: boolean) => void;
  /** 主图边长（px），默认 96（紧凑条），嵌入基础信息时传 180 */
  size?: number;
}

/**
 * 主图（方图，尺寸可配）
 * - 全组件唯一的"点击打开大图预览"入口（antd 单层预览）
 * - 左右切换查看其他图片；角标显示资产类型（唯一的"主图"徽标位置）
 */
const PreviewImage: React.FC<PreviewImageProps> = ({
  record,
  assetMeta,
  currentIndex,
  setCurrentIndex,
  total,
  previewHovered,
  setPreviewHovered,
  size = 96,
}) => {
  if (!record) {
    return (
      <div
        style={{
          width: size,
          height: size,
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-quaternary)',
          fontSize: 12,
          gap: 4,
          flexShrink: 0,
        }}
      >
        暂无图片
      </div>
    );
  }

  const fullUrl = record.fileUrl;

  const arrowStyle = (side: 'left' | 'right'): CSSProperties => ({
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: 2,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    display: total > 1 ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    cursor: 'pointer',
    zIndex: 3,
    border: 'none',
    transition: 'background 0.2s',
  });

  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      onMouseEnter={() => setPreviewHovered(true)}
      onMouseLeave={() => setPreviewHovered(false)}
    >
      <Image
        loading="lazy"
        src={record.fileUrl}
        alt="主图"
        width={size}
        height={size}
        style={{ objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }}
        preview={{ src: fullUrl || record.fileUrl }}
      />
      {/* 资产类型角标（唯一徽标，避免缩略图上重复显示） */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: 4,
          padding: '0 6px',
          fontSize: 10,
          lineHeight: '16px',
          borderRadius: 4,
          background: assetMeta.color,
          color: '#fff',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {assetMeta.label}
      </div>
      {/* 悬停查看提示 */}
      {previewHovered && (
        <div
          style={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 20,
            height: 20,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <ZoomInOutlined />
        </div>
      )}
      <button
        type="button"
        aria-label="上一张"
        style={arrowStyle('left') as CSSProperties}
        onClick={(e) => {
          e.stopPropagation();
          setCurrentIndex((currentIndex - 1 + total) % total);
        }}
      >
        <LeftOutlined />
      </button>
      <button
        type="button"
        aria-label="下一张"
        style={arrowStyle('right') as CSSProperties}
        onClick={(e) => {
          e.stopPropagation();
          setCurrentIndex((currentIndex + 1) % total);
        }}
      >
        <RightOutlined />
      </button>
    </div>
  );
};

export default PreviewImage;
