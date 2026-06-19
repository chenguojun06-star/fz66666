import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

type IdLike = string | number;

interface ImageAsset {
  url: string;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i;

const attachmentCache = new Map<string, ImageAsset[]>();
const pendingCache = new Map<string, Promise<ImageAsset[]>>();

function buildCacheKey(styleId?: IdLike, styleNo?: string): string {
  const idPart = styleId != null ? String(styleId).trim() : '';
  const noPart = styleNo != null ? String(styleNo).trim() : '';
  return `${idPart}::${noPart}`;
}

function isImageAttachment(item: any): boolean {
  const ft = String(item?.fileType || '').toLowerCase();
  const fn = String(item?.fileName || '').toLowerCase();
  const fu = String(item?.fileUrl || '').toLowerCase();
  return ft.includes('image') || IMAGE_EXT_RE.test(ft) || IMAGE_EXT_RE.test(fn) || IMAGE_EXT_RE.test(fu);
}

async function fetchAttachments(styleId?: IdLike, styleNo?: string): Promise<ImageAsset[]> {
  const key = buildCacheKey(styleId, styleNo);
  if (attachmentCache.has(key)) return attachmentCache.get(key)!;
  if (pendingCache.has(key)) return pendingCache.get(key)!;

  const promise = (async () => {
    try {
      const res = await api.get<{ code: number; data: any[] }>('/style/attachment/list', {
        params: { styleId, styleNo },
      });
      const list: ImageAsset[] = [];
      const seen = new Set<string>();
      (Array.isArray(res?.data) ? res.data : []).forEach((item: any) => {
        const url = String(item?.fileUrl || '').trim();
        if (!url || !isImageAttachment(item) || seen.has(url)) return;
        seen.add(url);
        list.push({ url });
      });
      attachmentCache.set(key, list);
      return list;
    } catch {
      attachmentCache.set(key, []);
      return [];
    } finally {
      pendingCache.delete(key);
    }
  })();

  pendingCache.set(key, promise);
  return promise;
}

export interface CardCoverSwitcherProps {
  styleId?: IdLike;
  styleNo?: string;
  src?: string | null;
  fit?: 'cover' | 'contain';
}

function CardCoverSwitcher({
  styleId,
  styleNo,
  src,
  fit = 'contain',
}: CardCoverSwitcherProps) {
  const [images, setImages] = useState<ImageAsset[]>(() => {
    const cover = String(src || '').trim();
    return cover ? [{ url: cover }] : [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cover = String(src || '').trim();
    if (!styleId && !styleNo) {
      setImages(cover ? [{ url: cover }] : []);
      setCurrentIndex(0);
      return;
    }

    let mounted = true;
    setLoading(true);
    void (async () => {
      const attachments = await fetchAttachments(styleId, styleNo);
      if (!mounted) return;
      const all: ImageAsset[] = [];
      const seen = new Set<string>();
      if (cover) { all.push({ url: cover }); seen.add(cover); }
      attachments.forEach((a) => {
        if (!seen.has(a.url)) { all.push(a); seen.add(a.url); }
      });
      setImages(all);
      setLoading(false);
    })();

    return () => { mounted = false; };
  }, [src, styleId, styleNo]);

  const hasMultiple = images.length > 1;
  const currentUrl = images[currentIndex]?.url || '';

  const goToPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev <= 0 ? images.length - 1 : prev - 1));
  }, [hasMultiple, images.length]);

  const goToNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev >= images.length - 1 ? 0 : prev + 1));
  }, [hasMultiple, images.length]);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getFullAuthedFileUrl(currentUrl);
    if (url) window.open(url, '_blank');
  }, [currentUrl]);

  const authedUrl = useMemo(() => getFullAuthedFileUrl(currentUrl), [currentUrl]);

  const arrowBtnBase: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 24,
    height: 40,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s',
    zIndex: 2,
  }), []);

  return (
    <div
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      onMouseEnter={() => hasMultiple && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {loading && !authedUrl ? (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-bg-subtle)',
        }}>
          <span style={{ color: '#ccc', fontSize: 14 }}>...</span>
        </div>
      ) : authedUrl ? (
        <img
          src={authedUrl}
          alt="cover"
          loading="lazy"
          decoding="async"
          onClick={handleImageClick}
          style={{
            width: '100%', height: '100%', objectFit: fit,
            display: 'block', background: 'var(--color-bg-subtle)', cursor: 'pointer',
          }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-bg-subtle)',
        }}>
          <span style={{ color: '#ccc', fontSize: 14 }}>无图</span>
        </div>
      )}

      {hasMultiple && isHovered && (
        <>
          <div
            onClick={goToPrev}
            style={{ ...arrowBtnBase, left: 0, borderRadius: '0 4px 4px 0' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.3)'; }}
          >
            <LeftOutlined style={{ color: 'var(--color-bg-base)', fontSize: 12 }} />
          </div>
          <div
            onClick={goToNext}
            style={{ ...arrowBtnBase, right: 0, borderRadius: '4px 0 0 4px' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.3)'; }}
          >
            <RightOutlined style={{ color: 'var(--color-bg-base)', fontSize: 12 }} />
          </div>
          <div style={{
            position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 4, zIndex: 2,
          }}>
            {images.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: idx === currentIndex ? 'var(--color-bg-base)' : 'rgba(255,255,255,0.5)',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(CardCoverSwitcher);