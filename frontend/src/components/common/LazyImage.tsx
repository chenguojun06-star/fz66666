import React, { useState, useRef, useEffect } from 'react';

interface LazyImageProps {
  src: string;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  alt?: string;
  fallback?: string;
  preview?: boolean;
  borderRadius?: number;
  placeholder?: React.ReactNode;
  threshold?: number;
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  width = 40,
  height = 40,
  style,
  className,
  alt = '',
  fallback = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  preview: _preview = false,
  borderRadius = 4,
  placeholder,
  threshold = 100,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = imgRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${threshold}px` }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const containerStyle: React.CSSProperties = {
    width,
    height,
    borderRadius,
    overflow: 'hidden',
    position: 'relative',
    background: '#f5f5f5',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };

  const defaultPlaceholder = (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  );

  if (!isInView) {
    return (
      <div ref={imgRef} style={containerStyle} className={className}>
        {placeholder || defaultPlaceholder}
      </div>
    );
  }

  return (
    <div ref={imgRef} style={containerStyle} className={className}>
      {!isLoaded && (placeholder || defaultPlaceholder)}
      <img
        src={hasError ? fallback : src}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius,
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
          display: 'block',
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

export default React.memo(LazyImage);
