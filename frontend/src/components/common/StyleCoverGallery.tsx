import React from 'react';

import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { StyleAttachment } from '@/types/style';

type IdLike = string | number;

type StyleImageAsset = {
  key: string;
  url: string;
  color?: string;
};

const COLOR_IMAGE_BIZ_TYPE_PREFIX = 'color_image::';
const styleAttachmentCache = new Map<string, StyleAttachment[]>();
const styleAttachmentPromiseCache = new Map<string, Promise<StyleAttachment[]>>();
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i;

const buildStyleAssetCacheKey = (styleId?: IdLike, styleNo?: string) => {
  const idPart = styleId != null ? String(styleId).trim() : '';
  const noPart = styleNo != null ? String(styleNo).trim() : '';
  return `${idPart}::${noPart}`;
};

const parseColorImageBizType = (bizType: unknown) => {
  const value = String(bizType || '').trim();
  if (!value.startsWith(COLOR_IMAGE_BIZ_TYPE_PREFIX)) {
    return null;
  }
  const rawColor = value.slice(COLOR_IMAGE_BIZ_TYPE_PREFIX.length);
  if (!rawColor) {
    return '';
  }
  try {
    return decodeURIComponent(rawColor);
  } catch {
    return rawColor;
  }
};

const isImageAttachment = (attachment: StyleAttachment) => {
  const fileType = String(attachment?.fileType || '').trim().toLowerCase();
  const fileName = String(attachment?.fileName || '').trim().toLowerCase();
  const fileUrl = String(attachment?.fileUrl || '').trim().toLowerCase();
  return fileType.includes('image')
    || IMAGE_EXT_RE.test(fileType)
    || IMAGE_EXT_RE.test(fileName)
    || IMAGE_EXT_RE.test(fileUrl);
};

const fetchStyleAttachments = async (styleId?: IdLike, styleNo?: string) => {
  const cacheKey = buildStyleAssetCacheKey(styleId, styleNo);
  if (styleAttachmentCache.has(cacheKey)) {
    return styleAttachmentCache.get(cacheKey) || [];
  }
  if (styleAttachmentPromiseCache.has(cacheKey)) {
    return styleAttachmentPromiseCache.get(cacheKey) || Promise.resolve([]);
  }

  const promise = (async () => {
    try {
      const res = await api.get<{ code: number; data: StyleAttachment[] }>('/style/attachment/list', { params: { styleId, styleNo } });
      const list = Array.isArray(res?.data) ? res.data : [];
      styleAttachmentCache.set(cacheKey, list);
      return list;
    } catch {
      styleAttachmentCache.set(cacheKey, []);
      return [];
    } finally {
      styleAttachmentPromiseCache.delete(cacheKey);
    }
  })();

  styleAttachmentPromiseCache.set(cacheKey, promise);
  return promise;
};

const buildStyleImageAssets = (
  attachments: StyleAttachment[],
  preferredUrl?: string | null,
) => {
  const unique = new Map<string, StyleImageAsset>();
  const pushAsset = (asset: StyleImageAsset | null | undefined) => {
    if (!asset?.url) return;
    const normalizedUrl = String(asset.url).trim();
    if (!normalizedUrl || unique.has(normalizedUrl)) return;
    unique.set(normalizedUrl, { ...asset, url: normalizedUrl });
  };

  const preferred = String(preferredUrl || '').trim();
  if (preferred) {
    pushAsset({
      key: `preferred:${preferred}`,
      url: preferred,
    });
  }

  attachments.forEach((item) => {
    const fileUrl = String(item?.fileUrl || '').trim();
    if (!fileUrl || !isImageAttachment(item)) return;
    pushAsset({
      key: `${String(item?.id || fileUrl)}`,
      url: fileUrl,
      color: parseColorImageBizType(item?.bizType) || undefined,
    });
  });

  return Array.from(unique.values());
};

export interface StyleCoverGalleryProps {
  styleId?: IdLike;
  styleNo?: string;
  src?: string | null;
  fit?: 'cover' | 'contain';
  borderRadius?: number;
  thumbCount?: number;
}

const StyleCoverGallery: React.FC<StyleCoverGalleryProps> = ({
  styleId,
  styleNo,
  src,
  fit = 'cover',
  borderRadius = 8,
  thumbCount = 4,
}) => {
  const preferredUrl = React.useMemo(() => {
    const normalized = String(src || '').trim();
    return normalized || null;
  }, [src]);
  const [assets, setAssets] = React.useState<StyleImageAsset[]>(() => (
    buildStyleImageAssets([], preferredUrl)
  ));
  const [selectedUrl, setSelectedUrl] = React.useState<string | null>(preferredUrl);

  React.useEffect(() => {
    setSelectedUrl((prev) => prev === preferredUrl ? prev : preferredUrl);
    if (!preferredUrl) return;
    setAssets((prev) => {
      if (prev.some((item) => item.url === preferredUrl)) return prev;
      return [{ key: `preferred:${preferredUrl}`, url: preferredUrl }, ...prev];
    });
  }, [preferredUrl]);

  React.useEffect(() => {
    let mounted = true;
    if (!styleId && !styleNo) {
      const nextAssets = preferredUrl ? [{ key: `cover:${preferredUrl}`, url: preferredUrl }] : [];
      setAssets((prev) => {
        if (prev.length === nextAssets.length && prev.every((item, index) => item.url === nextAssets[index]?.url)) {
          return prev;
        }
        return nextAssets;
      });
      return () => { mounted = false; };
    }

    void (async () => {
      const attachments = await fetchStyleAttachments(styleId, styleNo);
      if (!mounted) return;
      const nextAssets = buildStyleImageAssets(attachments, preferredUrl);
      setAssets((prev) => {
        if (
          prev.length === nextAssets.length
          && prev.every((item, index) => item.url === nextAssets[index]?.url && item.color === nextAssets[index]?.color)
        ) {
          return prev;
        }
        return nextAssets;
      });
      setSelectedUrl((prev) => {
        if (prev && nextAssets.some((item) => item.url === prev)) return prev;
        return nextAssets[0]?.url || null;
      });
    })();

    return () => { mounted = false; };
  }, [preferredUrl, styleId, styleNo]);

  const visibleAssets = assets.slice(0, Math.max(thumbCount, 1));
  const extraCount = Math.max(0, assets.length - visibleAssets.length);
  const selectedAsset = assets.find((item) => item.url === selectedUrl) || assets[0] || null;
  const selectedImageUrl = getFullAuthedFileUrl(selectedAsset?.url || preferredUrl || null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius,
          overflow: 'hidden',
          background: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (selectedImageUrl) {
            window.open(selectedImageUrl, '_blank');
          }
        }}
      >
        {selectedImageUrl ? (
          <img
            src={selectedImageUrl}
            alt="cover"
            style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
          />
        ) : (
          <span style={{ color: '#ccc', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>无图</span>
        )}
      </div>
      {assets.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 36 }}>
          {visibleAssets.map((item, index) => {
            const thumbUrl = getFullAuthedFileUrl(item.url);
            const isSelected = item.url === selectedAsset?.url;
            const isLastVisible = index === visibleAssets.length - 1 && extraCount > 0;
            return (
              <div
                key={item.key}
                title={item.color || '切换图片'}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedUrl(item.url);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: isSelected ? '2px solid var(--color-primary)' : '1px solid #d9d9d9',
                  background: '#f5f5f5',
                  cursor: 'pointer',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={item.color || `thumb-${index}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : null}
                {isLastVisible ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.45)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    +{extraCount}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default StyleCoverGallery;
