import React from 'react';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

type IdLike = string | number;
const EMPTY_COVER_OVERRIDE = '__EMPTY_STYLE_COVER__';
const STYLE_COVER_OVERRIDE_EVENT = 'style-cover-override-change';

const getStyleCoverOverrideKeys = (styleId?: IdLike, styleNo?: string) => ([
  styleId != null && String(styleId).trim() ? `style-cover-override:id:${String(styleId).trim()}` : null,
  styleNo != null && String(styleNo).trim() ? `style-cover-override:no:${String(styleNo).trim()}` : null,
].filter(Boolean) as string[]);

export const setStyleCoverOverride = (styleId?: IdLike, styleNo?: string, url?: string | null) => {
  if (typeof window === 'undefined') return;
  if (!styleId && !styleNo) return;
  const storedValue = url === null ? EMPTY_COVER_OVERRIDE : (url || null);
  getStyleCoverOverrideKeys(styleId, styleNo).forEach((key) => {
    if (storedValue !== null) {
      window.localStorage.setItem(key, storedValue);
    } else {
      window.localStorage.removeItem(key);
    }
  });
  window.dispatchEvent(new CustomEvent(STYLE_COVER_OVERRIDE_EVENT, {
    detail: {
      styleId: styleId != null ? String(styleId) : '',
      styleNo: styleNo != null ? String(styleNo) : '',
      url: url ?? null,
      keys: getStyleCoverOverrideKeys(styleId, styleNo),
    },
  }));
};

export const getStyleCoverOverride = (styleId?: IdLike, styleNo?: string) => {
  if (typeof window === 'undefined') return null;
  if (!styleId && !styleNo) return null;
  const keys = getStyleCoverOverrideKeys(styleId, styleNo);
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value === EMPTY_COVER_OVERRIDE) return '';
    if (value) return value;
  }
  return null;
};

const StyleCoverThumb: React.FC<{
  styleId?: IdLike;
  styleNo?: string;
  src?: string | null;
  size?: number | 'fill';
  borderRadius?: number;
  fit?: 'cover' | 'contain';
}> = ({ styleId, styleNo, src, size = 40, borderRadius = 6, fit = 'cover' }) => {
  const isFill = size === 'fill';
  const numSize = (!isFill && typeof size === 'number' && !isNaN(size) && size > 0) ? size : 40;
  const preferredUrl = React.useMemo(() => {
    const override = getStyleCoverOverride(styleId, styleNo);
    if (override !== null) {
      return override || null;
    }
    return src || null;
  }, [src, styleId, styleNo]);
  const overrideKeys = React.useMemo(() => getStyleCoverOverrideKeys(styleId, styleNo), [styleId, styleNo]);
  const [url, setUrl] = React.useState<string | null>(preferredUrl);
  const [loading, setLoading] = React.useState(false);
  const [srcFailed, setSrcFailed] = React.useState(false);
  const [fallbackFailed, setFallbackFailed] = React.useState(false);

  React.useEffect(() => {
    setUrl((prev) => prev === preferredUrl ? prev : preferredUrl);
    setSrcFailed(false);
    setFallbackFailed(false);
  }, [preferredUrl]);

  React.useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (!event.key || !overrideKeys.includes(event.key)) return;
      const nextUrl = event.newValue === EMPTY_COVER_OVERRIDE ? null : (event.newValue || src || null);
      setUrl((prev) => prev === nextUrl ? prev : nextUrl);
      setSrcFailed(false);
      setFallbackFailed(false);
    };
    const customHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ keys?: string[]; url?: string | null }>).detail;
      if (!detail?.keys?.some((key) => overrideKeys.includes(key))) return;
      const nextUrl = detail.url || null;
      setUrl((prev) => prev === nextUrl ? prev : nextUrl);
      setSrcFailed(false);
      setFallbackFailed(false);
    };
    window.addEventListener('storage', handler);
    window.addEventListener(STYLE_COVER_OVERRIDE_EVENT, customHandler as any);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(STYLE_COVER_OVERRIDE_EVENT, customHandler as any);
    };
  }, [overrideKeys, src]);

  React.useEffect(() => {
    let mounted = true;
    if (fallbackFailed) return () => { mounted = false; };
    if (preferredUrl && !srcFailed) return () => { mounted = false; };
    if (!styleId && !styleNo) return () => { mounted = false; };

    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: any[] }>('/style/attachment/list', { params: { styleId, styleNo } });
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          const first = (images[0] as any)?.fileUrl || null;
          if (mounted) {
            setUrl((prev) => prev === first ? prev : first);
          }
        }
      } catch {
        if (mounted) {
          setUrl((prev) => prev === null ? prev : null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fallbackFailed, preferredUrl, srcFailed, styleId, styleNo]);

  return (
    <div
      style={{
        width: isFill ? '100%' : numSize,
        height: isFill ? '100%' : numSize,
        borderRadius,
        overflow: 'hidden',
        background: 'var(--color-bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
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
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>...</span>
      ) : url ? (
        <img
          src={getFullAuthedFileUrl(url)}
          alt="cover"
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            display: 'block',
            background: isFill ? '#f5f5f5' : undefined,
          }}
          onError={() => {
            if (url === preferredUrl && preferredUrl && !srcFailed) {
              setSrcFailed(true);
              setUrl(null);
            } else {
              setFallbackFailed(true);
              setUrl(null);
            }
          }}
        />
      ) : (
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>无图</span>
      )}
    </div>
  );
};

export default StyleCoverThumb;
