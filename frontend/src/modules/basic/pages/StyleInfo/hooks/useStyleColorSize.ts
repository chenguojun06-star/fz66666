import { useState, useEffect, useRef } from 'react';
import { App } from 'antd';
import dayjs from 'dayjs';
import api, { type ApiResult, isApiSuccess, getApiMessage } from '@/utils/api';
import { setStyleCoverOverride } from '@/components/StyleAssets';

type SizeColorMatrixRow = {
  color: string;
  quantities: number[];
  imageUrl?: string;
};

type PendingColorImage = {
  color: string;
  file: File;
};

const COLOR_IMAGE_BIZ_TYPE_PREFIX = 'color_image::';

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

const buildColorImageBizType = (color: string) => `${COLOR_IMAGE_BIZ_TYPE_PREFIX}${String(color || '').trim()}`;

interface UseStyleColorSizeOptions {
  currentStyle: any;
  setCurrentStyle: React.Dispatch<React.SetStateAction<any>>;
  isNewPage: boolean;
  form: any;
}

export function useStyleColorSize({ currentStyle, setCurrentStyle, isNewPage, form }: UseStyleColorSizeOptions) {
  const { message: _message } = App.useApp();

  const [commonColors, setCommonColors] = useState<string[]>([]);
  const [commonSizes, setCommonSizes] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [colorRes, sizeRes] = await Promise.all([
          api.get<any>('/system/dict/list', { params: { dictType: 'color', page: 1, pageSize: 200 } }),
          api.get<any>('/system/dict/list', { params: { dictType: 'size', page: 1, pageSize: 200 } }),
        ]);
        if (!mounted) return;
        const colorRecords = colorRes?.data?.records || (Array.isArray(colorRes?.data) ? colorRes.data : []);
        const sizeRecords = sizeRes?.data?.records || (Array.isArray(sizeRes?.data) ? sizeRes.data : []);
        const colorLabels = colorRecords.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        const sizeLabels = sizeRecords.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        if (colorLabels.length) setCommonColors(colorLabels);
        else setCommonColors(['黑色', '白色', '灰色', '蓝色', '红色']);
        if (sizeLabels.length) setCommonSizes(sizeLabels);
        else setCommonSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      } catch {
        if (mounted) {
          setCommonColors(['黑色', '白色', '灰色', '蓝色', '红色']);
          setCommonSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [size1, setSize1] = useState('');
  const [size2, setSize2] = useState('');
  const [size3, setSize3] = useState('');
  const [size4, setSize4] = useState('');
  const [size5, setSize5] = useState('');

  const [color1, setColor1] = useState('');
  const [color2, setColor2] = useState('');
  const [color3, setColor3] = useState('');
  const [color4, setColor4] = useState('');
  const [color5, setColor5] = useState('');

  const [qty1, setQty1] = useState(0);
  const [qty2, setQty2] = useState(0);
  const [qty3, setQty3] = useState(0);
  const [qty4, setQty4] = useState(0);
  const [qty5, setQty5] = useState(0);

  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [sizeColorMatrixRows, setSizeColorMatrixRows] = useState<SizeColorMatrixRow[]>([]);
  const [colorImageMap, setColorImageMap] = useState<Record<string, string>>({});
  const [coverRefreshToken, setCoverRefreshToken] = useState(0);

  const skipColorSizeResetRef = useRef(false);

  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingColorImages, setPendingColorImages] = useState<PendingColorImage[]>([]);

  useEffect(() => {
    if (!currentStyle) return;
    if (skipColorSizeResetRef.current) {
      skipColorSizeResetRef.current = false;
      return;
    }

    if ((currentStyle as any).sizeColorConfig) {
      try {
        const config = JSON.parse((currentStyle as any).sizeColorConfig);
        if (config.sizes) {
          const sizes = config.sizes.map((item: unknown) => String(item || '').trim()).filter(Boolean);
          setMatrixSizes(sizes);
          setSize1(sizes[0] || '');
          setSize2(sizes[1] || '');
          setSize3(sizes[2] || '');
          setSize4(sizes[3] || '');
          setSize5(sizes[4] || '');
        }
        if (config.colors) {
          const colors = config.colors.map((item: unknown) => String(item || '').trim()).filter(Boolean);
          setMatrixColors(colors);
          setColor1(colors[0] || '');
          setColor2(colors[1] || '');
          setColor3(colors[2] || '');
          setColor4(colors[3] || '');
          setColor5(colors[4] || '');
        }
        if (config.quantities) {
          setQty1(config.quantities[0] || 0);
          setQty2(config.quantities[1] || 0);
          setQty3(config.quantities[2] || 0);
          setQty4(config.quantities[3] || 0);
          setQty5(config.quantities[4] || 0);
        }
        if (Array.isArray(config.matrixRows)) {
          const restoredRows = config.matrixRows.map((row: any) => ({
            color: String(row?.color || ''),
            quantities: Array.isArray(row?.quantities) ? row.quantities.map((qty: any) => Number(qty || 0)) : [],
            imageUrl: row?.imageUrl || undefined,
          }));
          setSizeColorMatrixRows(restoredRows);
          const imageMapFromConfig: Record<string, string> = {};
          restoredRows.forEach((row) => {
            if (row.color && row.imageUrl) {
              imageMapFromConfig[row.color] = row.imageUrl;
            }
          });
          if (Object.keys(imageMapFromConfig).length > 0) {
            setColorImageMap((prev) => ({ ...imageMapFromConfig, ...prev }));
          }
        } else {
          setSizeColorMatrixRows([]);
        }
        if (config.commonSizes) {
          setCommonSizes(config.commonSizes);
        }
        if (config.commonColors) {
          setCommonColors(config.commonColors);
        }
        return;
      } catch (e) {
        console.error('解析sizeColorConfig失败:', e);
      }
    }

    const legacy = currentStyle as any;
    const legacySizes = [legacy.size1, legacy.size2, legacy.size3, legacy.size4, legacy.size5].map((item) => String(item || '').trim()).filter(Boolean);
    const legacyColors = [legacy.color1, legacy.color2, legacy.color3, legacy.color4, legacy.color5].map((item) => String(item || '').trim()).filter(Boolean);
    setMatrixSizes(legacySizes);
    setMatrixColors(legacyColors);
    setSize1(legacySizes[0] || '');
    setSize2(legacySizes[1] || '');
    setSize3(legacySizes[2] || '');
    setSize4(legacySizes[3] || '');
    setSize5(legacySizes[4] || '');

    setColor1(legacyColors[0] || '');
    setColor2(legacyColors[1] || '');
    setColor3(legacyColors[2] || '');
    setColor4(legacyColors[3] || '');
    setColor5(legacyColors[4] || '');

    setQty1(legacy.qty1 || 0);
    setQty2(legacy.qty2 || 0);
    setQty3(legacy.qty3 || 0);
    setQty4(legacy.qty4 || 0);
    setQty5(legacy.qty5 || 0);
    setSizeColorMatrixRows([]);
    setColorImageMap({});
  }, [currentStyle]);

  useEffect(() => {
    const resolvedStyleId = String(currentStyle?.id ?? '').trim();
    const resolvedStyleNo = String(currentStyle?.styleNo || '').trim();
    if (!resolvedStyleId && !resolvedStyleNo) return;
    let mounted = true;
    void (async () => {
      const nextMap: Record<string, string> = {};
      // 1. 优先从 SKU 表读取（source of truth，与 SKU 表格显示一致）
      if (resolvedStyleNo) {
        try {
          const skuRes = await api.get<ApiResult<Record<string, string>>>(`/style/sku/color-images/${encodeURIComponent(resolvedStyleNo)}`);
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
      // 2. 用 attachment 列表补充 SKU 未覆盖的颜色（向后兼容）
      try {
        const res = await api.get<ApiResult<any[]>>('/style/attachment/list', {
          params: resolvedStyleId ? { styleId: resolvedStyleId } : { styleNo: resolvedStyleNo },
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

  const colorImageMapKey = JSON.stringify(colorImageMap);
  useEffect(() => {
    setSizeColorMatrixRows((prev) => prev.map((row) => ({
      ...row,
      imageUrl: colorImageMap[row.color] || row.imageUrl,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorImageMapKey]);

  useEffect(() => {
    const normalized = [...matrixSizes, '', '', '', '', ''];
    setSize1(normalized[0] || '');
    setSize2(normalized[1] || '');
    setSize3(normalized[2] || '');
    setSize4(normalized[3] || '');
    setSize5(normalized[4] || '');
  }, [matrixSizes]);

  useEffect(() => {
    const normalized = [...matrixColors, '', '', '', '', ''];
    setColor1(normalized[0] || '');
    setColor2(normalized[1] || '');
    setColor3(normalized[2] || '');
    setColor4(normalized[3] || '');
    setColor5(normalized[4] || '');
  }, [matrixColors]);

  useEffect(() => {
    const currentPatternNo = String(form.getFieldValue('patternNo') || '').trim();
    if (!isNewPage || currentPatternNo) return;
    form.setFieldValue('patternNo', `ZYH${dayjs().format('YYYYMMDDHHmmss')}`);
  }, [form, isNewPage]);

  const handleCoverChange = (url: string | null) => {
    skipColorSizeResetRef.current = true;
    setCurrentStyle((prev) => (prev ? { ...prev, cover: url || undefined } as any : prev));
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
        params: resolvedStyleId ? { styleId: resolvedStyleId } : { styleNo: resolvedStyleNo },
      });
      const oldList = (Array.isArray(oldRes?.data) ? oldRes.data : []).filter((item: any) =>
        parseColorImageBizType(item?.bizType) === normalizedColor
      );
      await Promise.all(oldList.map((item: any) => api.delete(`/style/attachment/${item.id}`)));
      const formData = new FormData();
      formData.append('file', file);
      if (resolvedStyleId) {
        formData.append('styleId', resolvedStyleId);
      }
      if (resolvedStyleNo) {
        formData.append('styleNo', resolvedStyleNo);
      }
      formData.append('bizType', bizType);
      const res = await api.post<ApiResult<{ fileUrl?: string }>>('/style/attachment/upload', formData, { timeout: 60000 } as any);
      if (!isApiSuccess(res)) {
        throw new Error(getApiMessage(res, '上传失败'));
      }
      const uploadedUrl = String(res?.data?.fileUrl || '');
      if (uploadedUrl) {
        setColorImageMap((prev) => ({ ...prev, [color]: uploadedUrl }));
        handleCoverChange(uploadedUrl);
        // 同步到 SKU 表，保持矩阵与 SKU 表格图片一致
        if (resolvedStyleId) {
          try {
            await api.put(`/style/sku/color-images/${resolvedStyleId}`, { [normalizedColor]: uploadedUrl });
          } catch (e) {
            console.error('同步SKU颜色图片失败:', e);
          }
        }
      }
      setCoverRefreshToken((prev) => prev + 1);
      return;
    }
    setPendingImages((prev) => {
      const exists = prev.some((item) =>
        item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
      );
      return exists ? prev : [...prev, file];
    });
    setPendingColorImages((prev) => [...prev.filter((item) => item.color !== color), { color, file }]);
  };

  const handleColorImageClear = async (color: string) => {
    const resolvedStyleId = String(currentStyle?.id ?? '').trim();
    const resolvedStyleNo = String(currentStyle?.styleNo || '').trim();
    if (resolvedStyleId || resolvedStyleNo) {
      const normalizedColor = String(color || '').trim();
      const res = await api.get<ApiResult<any[]>>('/style/attachment/list', {
        params: resolvedStyleId ? { styleId: resolvedStyleId } : { styleNo: resolvedStyleNo },
      });
      const list = (Array.isArray(res?.data) ? res.data : []).filter((item: any) =>
        parseColorImageBizType(item?.bizType) === normalizedColor
      );
      await Promise.all(list.map((item: any) => api.delete(`/style/attachment/${item.id}`)));
      setColorImageMap((prev) => {
        const next = { ...prev };
        delete next[color];
        return next;
      });
      // 同步清空 SKU 表对应颜色的图片，保持矩阵与 SKU 表格一致
      if (resolvedStyleId) {
        try {
          await api.put(`/style/sku/color-images/${resolvedStyleId}`, { [normalizedColor]: '' });
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
      setPendingImages((prev) => prev.filter((file) =>
        !(file.name === removed.name && file.size === removed.size && file.lastModified === removed.lastModified)
      ));
    }
    setPendingColorImages((prev) => prev.filter((item) => item.color !== color));
  };

  const sizeColorConfig = {
    sizes: matrixSizes,
    colors: matrixColors,
    quantities: sizeColorMatrixRows.map((row) => row.quantities.reduce((sum, qty) => sum + Number(qty || 0), 0)),
    commonSizes,
    commonColors,
    matrixRows: sizeColorMatrixRows.map((row) => {
      const serverImgUrl = colorImageMap[row.color]
        || (row.imageUrl && !row.imageUrl.startsWith('data:') ? row.imageUrl : undefined);
      return {
        color: row.color,
        quantities: row.quantities,
        ...(serverImgUrl ? { imageUrl: serverImgUrl } : {}),
      };
    }),
  };

  const totalMatrixQty = sizeColorMatrixRows.reduce(
    (sum, row) => sum + row.quantities.reduce((subtotal, qty) => subtotal + Number(qty || 0), 0),
    0
  );

  return {
    commonColors, setCommonColors,
    commonSizes, setCommonSizes,
    size1, setSize1, size2, setSize2, size3, setSize3, size4, setSize4, size5, setSize5,
    color1, setColor1, color2, setColor2, color3, setColor3, color4, setColor4, color5, setColor5,
    qty1, setQty1, qty2, setQty2, qty3, setQty3, qty4, setQty4, qty5, setQty5,
    matrixSizes, setMatrixSizes,
    matrixColors, setMatrixColors,
    sizeColorMatrixRows, setSizeColorMatrixRows,
    colorImageMap, setColorImageMap,
    coverRefreshToken, setCoverRefreshToken,
    pendingImages, setPendingImages,
    pendingColorImages, setPendingColorImages,
    handleCoverChange,
    handleColorImageSync,
    handleColorImageClear,
    sizeColorConfig,
    totalMatrixQty,
  };
}

export type { SizeColorMatrixRow, PendingColorImage };
