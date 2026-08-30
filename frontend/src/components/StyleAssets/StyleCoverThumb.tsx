import React from 'react';
import { Image } from 'antd';
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
  onClick?: (e: React.MouseEvent) => void;
  color?: string; // 新增：颜色参数，传入后优先显示商品编码颜色图片
}> = ({ styleId, styleNo, src, size = 40, borderRadius = 6, fit = 'cover', onClick, color }) => {
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
  const [gallery, setGallery] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [srcFailed, setSrcFailed] = React.useState(false);
  const [fallbackFailed, setFallbackFailed] = React.useState(false);
  const loadedKeyRef = React.useRef<string | null>(null);

  // D-217：本款图集（附件列表全部图片），预览组只含本款图片——
  // 全局 PreviewGroup 会让预览左右切换翻到整页所有款式（串款），内层组就近覆盖退出全局组
  const previewItems = React.useMemo(() => {
    const list = url ? [url] : [];
    gallery.forEach((u) => { if (u && !list.includes(u)) list.push(u); });
    return list.map((u) => getFullAuthedFileUrl(u));
  }, [url, gallery]);

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
    if (!styleId && !styleNo) return () => { mounted = false; };

    // 同一款附件列表只需加载一次；颜色/款号变化时才重新加载
    const loadKey = `${String(styleId || '')}:${String(styleNo || '')}:${String(color || '')}`;
    if (loadedKeyRef.current === loadKey) return () => { mounted = false; };

    (async () => {
      setLoading(true);
      try {
        let imageUrl: string | null = null;

        // 优先获取商品编码颜色图片（如果有color参数）
        // color参数可能是逗号分隔的多颜色值（如"白色,蓝色,黑色"），只取第一个颜色查询
        if (color && styleNo) {
          try {
            const firstColor = String(color).split(',')[0].trim();
            const colorRes = await api.get<{ code: number; data: string | null }>('/style/sku/color-image', {
              params: { styleNo: String(styleNo).trim(), color: firstColor },
            });
            if (colorRes.code === 200 && colorRes.data) {
              imageUrl = colorRes.data;
            }
          } catch {
            // 忽略颜色图片获取失败，继续获取款号封面图
          }
        }

        // 始终拉取完整附件图集，保证预览时能看到全部图片（而不仅是封面）
        const res = await api.get<{ code: number; data: any[] }>('/style/attachment/list', { params: { styleId, styleNo } });
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) {
            setGallery(images.map((f: any) => f.fileUrl).filter(Boolean));
          }
          // 没有颜色图且外部也没给封面时，才用附件第一张兜底
          if (!imageUrl && !preferredUrl) {
            imageUrl = (images[0] as any)?.fileUrl || null;
          }
        }

        if (mounted && imageUrl) {
          setUrl((prev) => prev === imageUrl ? prev : imageUrl);
          loadedKeyRef.current = loadKey;
        } else if (mounted) {
          loadedKeyRef.current = loadKey;
        }
      } catch {
        if (mounted && !preferredUrl) {
          setUrl((prev) => prev === null ? prev : null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fallbackFailed, preferredUrl, srcFailed, styleId, styleNo, color]);

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
        if (onClick) {
          onClick(e);
        }
      }}
    >
      {loading ? (
        <span style={{ color: 'var(--color-text-quaternary)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>...</span>
      ) : url ? (
        <Image.PreviewGroup items={previewItems}>
          <Image
            src={getFullAuthedFileUrl(url)}
            alt="cover"
            width="100%"
            height="100%"
            style={{
              objectFit: fit,
              display: 'block',
              background: isFill ? 'var(--color-bg-subtle)' : undefined,
            }}
            // 传了 onClick 的场景（跳转详情）不预览；否则进本款专属预览组——
            // D-217：预览只在当前款式自己的图集内左右切换，不再串到整页其他款式
            preview={!onClick}
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
        </Image.PreviewGroup>
      ) : (
        <span style={{ color: 'var(--color-text-quaternary)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>无图</span>
      )}
    </div>
  );
};

export default StyleCoverThumb;
