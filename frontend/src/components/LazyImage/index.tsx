import React, { useState, useEffect, useRef } from 'react';
import { Spin } from 'antd';

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  placeholder?: string;
  width?: string | number;
  height?: string | number;
}

/**
 * 懒加载图片组件
 * 使用 IntersectionObserver API 实现图片懒加载
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '',
  className = '',
  placeholder = '/placeholder.png',
  width,
  height
}) => {
  const [imageSrc, setImageSrc] = useState<string>(placeholder);
  const [isLoading, setIsLoading] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // 创建 IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // 提前50px加载
        threshold: 0.01
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isInView && src) {
      setIsLoading(true);
      
      // 预加载图片
      const img = new Image();
      img.src = src;
      
      img.onload = () => {
        setImageSrc(src);
        setIsLoading(false);
      };
      
      img.onerror = () => {
        setImageSrc(placeholder);
        setIsLoading(false);
      };
    }
  }, [isInView, src, placeholder]);

  return (
    <div 
      ref={imgRef}
      className={`lazy-image-wrapper ${className}`}
      style={{ 
        position: 'relative',
        width,
        height,
        minHeight: height || '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5'
      }}
    >
      {isLoading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <Spin />
        </div>
      )}
      <img
        src={imageSrc}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s ease'
        }}
      />
    </div>
  );
};
