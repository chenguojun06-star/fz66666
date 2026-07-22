import { useState, useEffect, useRef } from 'react';
import api, { type ApiResult, isApiSuccess, getApiMessage } from '@/utils/api';
import { setStyleCoverOverride } from '@/components/StyleAssets';
import {
  parseColorImageBizType,
  buildColorImageBizType,
  isSameFile,
} from './utils';
import type { PendingColorImage } from './utils';

interface UseColorImagesOptions {
  currentStyle: any;
  setCurrentStyle: React.Dispatch<React.SetStateAction<any>>;
}

export function useColorImages({ currentStyle, setCurrentStyle }: UseColorImagesOptions) {
  const [colorImageMap, setColorImageMap] = useState<Record<string, string>>({});
  const [coverRefreshToken, setCoverRefreshToken] = useState(0);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingColorImages, setPendingColorImages] = useState<PendingColorImage[]>([]);

  const skipColorSizeResetRef = useRef(false);

  useEffect(() => {
    const resolvedStyleId = String(currentStyle?.id ?? '').trim();
    const resolvedStyleNo = String(currentStyle?.styleNo || '').trim();
    if (!resolvedStyleId && !resolvedStyleNo) return;
    let mounted = true;
    void (async () => {
      const nextMap: Record<string, string> = {};
      if (resolvedStyleNo) {
        try {
          const skuRes = await api.get<ApiResult<Record<string, string>>>(
            `/style/sku/color-images/${encodeURIComponent(resolvedStyleNo)}`
          );
          const skuMap = skuRes?.data;
          if (skuMap && typeof skuMap === 'object') {
            Object.entries(skuMap).forEach(([color, url]) => {
              if (color && url) {
                nextMap[color] = String(url);
              }
            });
          }
        } catch {
          // SKU 接口失败时降级到 attachment
        }
      }
      try {
        const res = await api.get<ApiResult<any[]>>('/style/attachment/list', {
          params: resolvedStyleId
            ? { styleId: resolvedStyleId }
            : { styleNo: resolvedStyleNo },
        });
        const list = Array.isArray(res?.data) ? res.data : [];
        list.forEach((item: any) => {
          const color = parseColorImageBizType(item?.bizType);
          if (color && item?.fileUrl && !nextMap[color]) {
            nextMap[color] = String(item.fileUrl);
          }
        });
      } catch {
        // 出错时保留已获取的 SKU 数据
      }
      if (mounted && Object.keys(nextMap).length > 0) {
        setColorImageMap((prev) => ({ ...prev, ...nextMap }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentStyle?.id, currentStyle?.styleNo, coverRefreshToken]);

  const handleCoverChange = (url: string | null) => {
    skipColorSizeResetRef.current = true;
    setCurrentStyle((prev) =>
      prev ? ({ ...prev, cover: url || undefined } as any) : prev
    );
    if (currentStyle?.id || currentStyle?.styleNo) {
      setStyleCoverOverride(currentStyle?.id, currentStyle?.styleNo, url);
    }
  };

  const handleColorImageSync = async (color: string, file: File) => {
    const normalizedColor = String(color || '').trim();
    const bizType = buildColorImageBizType(normalizedColor);
    const resolvedStyleId = String(currentStyle?.id ?? '').trim();
    const resolvedStyleNo = String(currentStyle?.styleNo || '').trim();
    if (resolvedStyleId || resolvedStyleNo) {
      const oldRes = await api.get('/style/attachment/list', {
        params: resolvedStyleId
          ? { styleId: resolvedStyleId }
          : { styleNo: resolvedStyleNo },
      });
      const oldList = (Array.isArray(oldRes?.data) ? oldRes.data : []).filter((item: any) =>
        parseColorImageBizType(item?.bizType) === normalizedColor
      );
      await Promise.all(
        oldList.map((item: any) => api.delete(`/style/attachment/${item.id}`))
      );
      const formData = new FormData();
      formData.append('file', file);
      if (resolvedStyleId) {
        formData.append('styleId', resolvedStyleId);
      }
      if (resolvedStyleNo) {
        formData.append('styleNo', resolvedStyleNo);
      }
      formData.append('bizType', bizType);
      const res = await api.post<ApiResult<{ fileUrl?: string }>>(
        '/style/attachment/upload',
        formData,
        { timeout: 60000 } as any
      );
      if (!isApiSuccess(res)) {
        throw new Error(getApiMessage(res, '上传失败'));
      }
      const uploadedUrl = String(res?.data?.fileUrl || '');
      if (uploadedUrl) {
        setColorImageMap((prev) => ({ ...prev, [color]: uploadedUrl }));
        handleCoverChange(uploadedUrl);
        if (resolvedStyleId) {
          try {
            await api.put(`/style/sku/color-images/${resolvedStyleId}`, {
              [normalizedColor]: uploadedUrl,
            });
          } catch (e) {
            console.error('同步SKU颜色图片失败:', e);
          }
        }
      }
      setCoverRefreshToken((prev) => prev + 1);
      return;
    }
    setPendingImages((prev) => {
      const exists = prev.some((item) => isSameFile(item, file));
      return exists ? prev : [...prev, file];
    });
    setPendingColorImages((prev) => [
      ...prev.filter((item) => item.color !== color),
      { color, file },
    ]);
  };

  const handleColorImageClear = async (color: string) => {
    const resolvedStyleId = String(currentStyle?.id ?? '').trim();
    const resolvedStyleNo = String(currentStyle?.styleNo || '').trim();
    if (resolvedStyleId || resolvedStyleNo) {
      const normalizedColor = String(color || '').trim();
      const res = await api.get<ApiResult<any[]>>('/style/attachment/list', {
        params: resolvedStyleId
          ? { styleId: resolvedStyleId }
          : { styleNo: resolvedStyleNo },
      });
      const list = (Array.isArray(res?.data) ? res.data : []).filter((item: any) =>
        parseColorImageBizType(item?.bizType) === normalizedColor
      );
      await Promise.all(
        list.map((item: any) => api.delete(`/style/attachment/${item.id}`))
      );
      setColorImageMap((prev) => {
        const next = { ...prev };
        delete next[color];
        return next;
      });
      if (resolvedStyleId) {
        try {
          await api.put(`/style/sku/color-images/${resolvedStyleId}`, {
            [normalizedColor]: '',
          });
        } catch (e) {
          console.error('同步清除SKU颜色图片失败:', e);
        }
      }
      if (String(currentStyle?.cover || '') === String(colorImageMap[color] || '')) {
        handleCoverChange(null);
      }
      setCoverRefreshToken((prev) => prev + 1);
      return;
    }
    const removed = pendingColorImages.find((item) => item.color === color)?.file;
    if (removed) {
      setPendingImages((prev) => prev.filter((file) => !isSameFile(file, removed)));
    }
    setPendingColorImages((prev) => prev.filter((item) => item.color !== color));
  };

  return {
    colorImageMap,
    setColorImageMap,
    coverRefreshToken,
    setCoverRefreshToken,
    pendingImages,
    setPendingImages,
    pendingColorImages,
    setPendingColorImages,
    handleCoverChange,
    handleColorImageSync,
    handleColorImageClear,
    skipColorSizeResetRef,
  };
}
