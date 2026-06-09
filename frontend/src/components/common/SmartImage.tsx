import React, { useState, useMemo, useCallback } from 'react';
import { Image } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

export interface SmartImageProps {
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  /** 预览配置，传入 boolean 或预览配置对象。如果传入对象，将与内置预览状态合并。 */
  preview?: boolean | { open?: boolean; onOpenChange?: (open: boolean) => void; current?: number; mask?: React.ReactNode; cover?: React.ReactNode };
  /** 如果是多图预览，传入所有图片的 src 数组 */
  allSrcs?: string[];
  /** 如果是多图预览，指定当前图片的索引 */
  currentIndex?: number;
  onClick?: (e: React.MouseEvent) => void;
}

const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  width,
  height,
  className,
  style,
  preview = true,
  allSrcs,
  currentIndex = 0,
  onClick,
}) => {
  const [internalPreviewOpen, setInternalPreviewOpen] = useState(false);
  const [internalPreviewIndex, setInternalPreviewIndex] = useState(currentIndex);

  const fullSrc = useMemo(() => getFullAuthedFileUrl(src), [src]);
  
  const allFullSrcs = useMemo(() => {
    if (!allSrcs || allSrcs.length === 0) return [fullSrc];
    return allSrcs.map(s => getFullAuthedFileUrl(s));
  }, [allSrcs, fullSrc]);

  // 处理预览配置
  const mergedPreview = useMemo(() => {
    // 如果 preview 是 false，完全禁用预览
    if (preview === false) return false;
    
    // 如果 preview 是对象，合并配置
    if (typeof preview === 'object') {
      return {
        open: preview.open ?? internalPreviewOpen,
        onOpenChange: (open: boolean) => {
          setInternalPreviewOpen(open);
          if (!open) {
            setInternalPreviewIndex(currentIndex);
          }
          preview.onOpenChange?.(open);
        },
        current: preview.current ?? internalPreviewIndex,
      };
    }
    
    // 默认预览配置
    return {
      open: internalPreviewOpen,
      onOpenChange: (open: boolean) => {
        setInternalPreviewOpen(open);
        if (!open) {
          setInternalPreviewIndex(currentIndex);
        }
      },
      current: internalPreviewIndex,
    };
  }, [preview, internalPreviewOpen, internalPreviewIndex, currentIndex]);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
    }
    if (!e.defaultPrevented && preview !== false) {
      setInternalPreviewIndex(currentIndex);
      setInternalPreviewOpen(true);
    }
  }, [onClick, preview, currentIndex]);

  // 如果有多张图，使用 PreviewGroup
  if (allSrcs && allSrcs.length > 1) {
    return (
      <Image.PreviewGroup preview={mergedPreview} items={allFullSrcs}>
        <Image
          src={fullSrc}
          alt={alt}
          width={width}
          height={height}
          className={className}
          style={style}
          onClick={handleImageClick}
        />
      </Image.PreviewGroup>
    );
  }

  // 单图直接使用 Image
  return (
    <Image
      src={fullSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      preview={mergedPreview}
      onClick={handleImageClick}
    />
  );
};

export default SmartImage;
