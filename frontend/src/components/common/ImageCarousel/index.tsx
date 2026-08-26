import React, { useEffect, useState } from 'react';
import { Image } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import './index.css';

export interface CarouselImage {
  url: string;
  key: string;
  /** 左上角角标，如"封面" */
  badge?: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  /** 图片最大显示高度，默认 280 */
  imageHeight?: number;
  /** 绝对定位浮层（如编辑按钮），渲染在轮播容器内 */
  overlay?: React.ReactNode;
  /** 当前索引变化回调（外部浮层需感知当前图时使用） */
  onIndexChange?: (idx: number) => void;
}

/**
 * 全局图片轮播组件 — 多图切换（左右箭头 + 序号角标 + 点击预览）。
 * 箭头常显（半透明黑底白图标），原生 button 实现，不受 antd 按钮 hover 样式干扰，
 * 遮罩层禁用指针事件，杜绝"悬停按钮消失/闪烁"问题。
 * 任意需要多图切换的场景（订单详情/样衣详情/成品库等）直接复用。
 */
const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, imageHeight = 280, overlay, onIndexChange }) => {
  const [idx, setIdx] = useState(0);
  const count = images.length;

  useEffect(() => {
    if (idx >= count) {
      setIdx(0);
      onIndexChange?.(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (count === 0) return null;

  const safeIdx = Math.min(idx, count - 1);
  const current = images[safeIdx];
  const switchTo = (next: number) => {
    setIdx(next);
    onIndexChange?.(next);
  };
  const goPrev = () => switchTo(idx > 0 ? idx - 1 : count - 1);
  const goNext = () => switchTo(idx < count - 1 ? idx + 1 : 0);

  return (
    <div className="image-carousel" style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden' }}>
      <Image.PreviewGroup>
        {images.map((item, i) => (
          <Image
            key={item.key}
            src={item.url}
            style={{
              display: i === safeIdx ? 'block' : 'none',
              width: '100%',
              maxHeight: imageHeight,
              objectFit: 'contain',
              borderRadius: 6,
              cursor: 'pointer',
            }}
            preview={{
              mask: <span style={{ fontSize: 12 }}>点击预览</span>,
            }}
          />
        ))}
      </Image.PreviewGroup>

      {count > 1 && (
        <>
          <button type="button" className="image-carousel-arrow image-carousel-arrow--left" onClick={goPrev} aria-label="上一张">
            <LeftOutlined />
          </button>
          <button type="button" className="image-carousel-arrow image-carousel-arrow--right" onClick={goNext} aria-label="下一张">
            <RightOutlined />
          </button>
          <div className="image-carousel-counter">
            {safeIdx + 1}/{count}
          </div>
        </>
      )}

      {current?.badge && <span className="image-carousel-badge">{current.badge}</span>}

      {overlay}
    </div>
  );
};

export default ImageCarousel;
