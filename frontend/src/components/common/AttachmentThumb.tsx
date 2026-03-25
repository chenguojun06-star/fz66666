import React, { CSSProperties, useEffect, useState } from 'react';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getStyleCoverOverride } from '@/components/StyleAssets';

interface AttachmentThumbProps {
  styleId: string | number;
  src?: string | null;
  cover?: string | null;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
}

/**
 * 附件缩略图组件（公共组件）
 * 显示款式的第一张图片附件
 *
 * 使用位置：
 * - 款式管理列表
 * - 款式详情页
 */
const AttachmentThumb: React.FC<AttachmentThumbProps> = ({
  styleId,
  src,
  cover,
  width = 40,
  height = 40,
  borderRadius = 4,
  className,
  style,
  imageStyle,
}) => {
  const resolvedSrc = (() => {
    const override = getStyleCoverOverride(styleId);
    if (override !== null) {
      return override || null;
    }
    return src || cover || null;
  })();
  const [url, setUrl] = useState<string | null>(resolvedSrc);
  const [loading, setLoading] = useState<boolean>(false);
  const [srcFailed, setSrcFailed] = useState(false);

  useEffect(() => {
    setUrl(resolvedSrc);
    setSrcFailed(false);
  }, [resolvedSrc]);

  useEffect(() => {
    let mounted = true;
    if (resolvedSrc && !srcFailed) return () => { mounted = false; };
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: any[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          const firstImage = (images[0] as any)?.fileUrl || null;
          if (mounted) setUrl(firstImage);
        }
      } catch {
        if (mounted && !resolvedSrc) setUrl(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [resolvedSrc, srcFailed, styleId]);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== `style-cover-override:id:${String(styleId)}`) return;
      setUrl(event.newValue === '__EMPTY_STYLE_COVER__' ? null : (event.newValue || src || cover || null));
      setSrcFailed(false);
    };
    const customHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ styleId?: string; url?: string | null }>).detail;
      if (detail?.styleId !== String(styleId)) return;
      setUrl(detail.url || null);
      setSrcFailed(false);
    };
    window.addEventListener('storage', handler);
    window.addEventListener('style-cover-override-change', customHandler as any);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('style-cover-override-change', customHandler as any);
    };
  }, [cover, src, styleId]);

  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        overflow: 'hidden',
        background: 'var(--color-bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        ...style,
      }}
      onClick={(e) => {
        e.stopPropagation();
        const validUrl = getFullAuthedFileUrl(url);
        if (validUrl) {
          window.open(validUrl, '_blank');
        }
      }}
    >
      {loading ? (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>...</span>
      ) : url ? (
        <img
          src={getFullAuthedFileUrl(url)}
          alt="cover"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...imageStyle }}
          onError={() => {
            if (url === resolvedSrc && resolvedSrc) {
              setSrcFailed(true);
            } else {
              setUrl(null);
            }
          }}
        />
      ) : (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>无图</span>
      )}
    </div>
  );
};

export default AttachmentThumb;
