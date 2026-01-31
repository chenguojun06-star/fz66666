import React, { useState, useEffect, useRef, memo } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
  fallback?: string;
  threshold?: number;
  rootMargin?: string;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * 懒加载图片组件
 * 使用IntersectionObserver实现图片懒加载
 * 
 * @example
 * <LazyImage
 *   src="https://example.com/image.jpg"
 *   alt="描述"
 *   placeholder="/placeholder.png"
 *   style={{ width: 200, height: 200 }}
 * />
 */
const LazyImageComponent: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder = '/placeholder.png',
  fallback = '/fallback.png',
  threshold = 0.1,
  rootMargin = '50px',
  onLoad,
  onError,
  style,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 设置IntersectionObserver
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observerRef.current?.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observerRef.current.observe(img);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [threshold, rootMargin]);

  // 处理图片加载完成
  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  // 处理图片加载错误
  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // 确定要显示的图片
  const displaySrc = hasError ? fallback : isInView ? src : placeholder;

  return (
    <img
      ref={imgRef}
      src={displaySrc}
      alt={alt}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
        ...style,
      }}
      {...props}
    />
  );
};

// 使用memo避免不必要的重渲染
export const LazyImage = memo(LazyImageComponent);

/**
 * 图片预加载Hook
 * 
 * @example
 * const { preloadImage, isPreloaded } = useImagePreloader();
 * 
 * useEffect(() => {
 *   preloadImage('https://example.com/image.jpg');
 * }, []);
 */
export function useImagePreloader() {
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set());

  const preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (preloadedImages.has(src)) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => {
        setPreloadedImages((prev) => new Set([...prev, src]));
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  };

  const preloadImages = async (srcs: string[]): Promise<void> => {
    await Promise.all(srcs.map(preloadImage));
  };

  const isPreloaded = (src: string): boolean => {
    return preloadedImages.has(src);
  };

  return {
    preloadImage,
    preloadImages,
    isPreloaded,
  };
}

/**
 * 图片画廊懒加载组件
 * 
 * @example
 * <LazyImageGallery
 *   images={[
 *     { src: 'image1.jpg', alt: '图片1' },
 *     { src: 'image2.jpg', alt: '图片2' },
 *   ]}
 *   columns={3}
 * />
 */
interface GalleryImage {
  src: string;
  alt: string;
  thumbnail?: string;
}

interface LazyImageGalleryProps {
  images: GalleryImage[];
  columns?: number;
  gap?: number;
  onImageClick?: (image: GalleryImage, index: number) => void;
}

export const LazyImageGallery: React.FC<LazyImageGalleryProps> = ({
  images,
  columns = 3,
  gap = 16,
  onImageClick,
}) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
      }}
    >
      {images.map((image, index) => (
        <div
          key={index}
          onClick={() => onImageClick?.(image, index)}
          style={{ cursor: onImageClick ? 'pointer' : 'default' }}
        >
          <LazyImage
            src={image.src}
            alt={image.alt}
            style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
          />
        </div>
      ))}
    </div>
  );
};
