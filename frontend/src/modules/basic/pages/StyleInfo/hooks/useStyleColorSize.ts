import { useState, useEffect } from 'react';
import { App } from 'antd';
import dayjs from 'dayjs';
import { useCommonDict } from './useCommonDict';
import { useColorImages } from './useColorImages';
import {
  parseSizeColorConfig,
  buildImageMapFromRows,
  calculateTotalMatrixQty,
  buildSizeColorConfig,
  normalizeStringList,
} from './utils';
import type { SizeColorMatrixRow, PendingColorImage } from './utils';

interface UseStyleColorSizeOptions {
  currentStyle: any;
  setCurrentStyle: React.Dispatch<React.SetStateAction<any>>;
  isNewPage: boolean;
  form: any;
}

export function useStyleColorSize({
  currentStyle,
  setCurrentStyle,
  isNewPage,
  form,
}: UseStyleColorSizeOptions) {
  const { message: _message } = App.useApp();

  const { commonColors, setCommonColors, commonSizes, setCommonSizes } = useCommonDict();

  const {
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
  } = useColorImages({ currentStyle, setCurrentStyle });

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

  useEffect(() => {
    if (!currentStyle) return;
    if (skipColorSizeResetRef.current) {
      skipColorSizeResetRef.current = false;
      return;
    }

    if ((currentStyle as any).sizeColorConfig) {
      try {
        const config = parseSizeColorConfig((currentStyle as any).sizeColorConfig);
        if (config.sizes.length) {
          setMatrixSizes(config.sizes);
          setSize1(config.sizes[0] || '');
          setSize2(config.sizes[1] || '');
          setSize3(config.sizes[2] || '');
          setSize4(config.sizes[3] || '');
          setSize5(config.sizes[4] || '');
        }
        if (config.colors.length) {
          setMatrixColors(config.colors);
          setColor1(config.colors[0] || '');
          setColor2(config.colors[1] || '');
          setColor3(config.colors[2] || '');
          setColor4(config.colors[3] || '');
          setColor5(config.colors[4] || '');
        }
        if (config.quantities.length) {
          setQty1(config.quantities[0] || 0);
          setQty2(config.quantities[1] || 0);
          setQty3(config.quantities[2] || 0);
          setQty4(config.quantities[3] || 0);
          setQty5(config.quantities[4] || 0);
        }
        if (config.matrixRows.length) {
          setSizeColorMatrixRows(config.matrixRows);
          const imageMapFromConfig = buildImageMapFromRows(config.matrixRows);
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
    const legacySizes = normalizeStringList([
      legacy.size1,
      legacy.size2,
      legacy.size3,
      legacy.size4,
      legacy.size5,
    ]);
    const legacyColors = normalizeStringList([
      legacy.color1,
      legacy.color2,
      legacy.color3,
      legacy.color4,
      legacy.color5,
    ]);
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
  }, [currentStyle, setColorImageMap, setCommonColors, setCommonSizes, skipColorSizeResetRef]);

  const colorImageMapKey = JSON.stringify(colorImageMap);
  useEffect(() => {
    setSizeColorMatrixRows((prev) =>
      prev.map((row) => ({
        ...row,
        imageUrl: colorImageMap[row.color] || row.imageUrl,
      }))
    );
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

  const sizeColorConfig = buildSizeColorConfig(
    matrixSizes,
    matrixColors,
    sizeColorMatrixRows,
    commonSizes,
    commonColors,
    colorImageMap
  );

  const totalMatrixQty = calculateTotalMatrixQty(sizeColorMatrixRows);

  return {
    commonColors,
    setCommonColors,
    commonSizes,
    setCommonSizes,
    size1,
    setSize1,
    size2,
    setSize2,
    size3,
    setSize3,
    size4,
    setSize4,
    size5,
    setSize5,
    color1,
    setColor1,
    color2,
    setColor2,
    color3,
    setColor3,
    color4,
    setColor4,
    color5,
    setColor5,
    qty1,
    setQty1,
    qty2,
    setQty2,
    qty3,
    setQty3,
    qty4,
    setQty4,
    qty5,
    setQty5,
    matrixSizes,
    setMatrixSizes,
    matrixColors,
    setMatrixColors,
    sizeColorMatrixRows,
    setSizeColorMatrixRows,
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
    sizeColorConfig,
    totalMatrixQty,
  };
}

export type { SizeColorMatrixRow, PendingColorImage };
