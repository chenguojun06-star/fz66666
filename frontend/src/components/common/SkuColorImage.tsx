import React, { useState, useEffect } from 'react';
import { Image, Spin, Tooltip } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface SkuColorImageProps {
  styleNo: string;
  color: string;
  size?: number;
  showPreview?: boolean;
}

/**
 * 通用SKU颜色图片组件
 * 根据款号+颜色显示对应的SKU图片
 */
const SkuColorImage: React.FC<SkuColorImageProps> = ({
  styleNo,
  color,
  size = 40,
  showPreview = true,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!styleNo || !color) {
      setLoading(false);
      setImageUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // 先尝试从缓存获取（如果有的话）
    const cacheKey = `sku-color-${styleNo}-${color}`;
    const cached = (window as any)[cacheKey];
    if (cached !== undefined) {
      if (!cancelled) {
        setImageUrl(cached);
        setLoading(false);
      }
      return;
    }

    // 从后端获取
    api.get<{ code: number; data: string | null }>('/style/sku/color-image', {
      params: { styleNo, color },
    }).then(res => {
      if (!cancelled) {
        const url = res.code === 200 ? res.data : null;
        // 缓存结果
        (window as any)[cacheKey] = url;
        setImageUrl(url);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setImageUrl(null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [styleNo, color]);

  if (loading) {
    return <Spin size="small" style={{ width: size, height: size }} />;
  }

  if (!imageUrl) {
    return (
      <Tooltip title={`${color} 暂无颜色图片`}>
        <div
          style={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-subtle)',
            borderRadius: 4,
            color: '#ccc',
            fontSize: size * 0.5,
          }}
        >
          <PictureOutlined />
        </div>
      </Tooltip>
    );
  }

  const fullUrl = getFullAuthedFileUrl(imageUrl);

  if (showPreview) {
    return (
      <Image
        src={fullUrl}
        width={size}
        height={size}
        style={{
          objectFit: 'cover',
          borderRadius: 4,
          display: 'block',
        }}
        preview={{ mask: <span style={{ fontSize: 10 }}>查看</span> }}
        fallback={undefined}
      />
    );
  }

  return (
    <img
      src={fullUrl}
      alt={color}
      loading="lazy"
      decoding="async"
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
};

export default SkuColorImage;
