import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { App, FormInstance } from 'antd';
import api from '@/utils/api';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';
import type { StyleBasicInfoFormRef } from './types';
import { DEFAULT_SIZE_MAP, FALLBACK_SIZES, SIZE_COLOR_SYNC_DEBOUNCE_MS } from './constants';

interface UseStyleBasicInfoFormParams {
  _form: FormInstance;
  styleId?: string;
  forwardedRef?: React.Ref<StyleBasicInfoFormRef>;
  onStyleParseResult?: (result: StyleFieldParseResult) => void;
  // 颜色/尺码同步 effect 依赖项
  colorOptions: string[];
  sizeOptions: string[];
  sizeColorMatrixRows: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  // 智能识别颜色填充
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  setColor1: (v: string) => void;
  setColor2: (v: string) => void;
  setColor3: (v: string) => void;
  setColor4: (v: string) => void;
  setColor5: (v: string) => void;
  commonColors: string[];
  setCommonColors: (v: string[]) => void;
  // 智能识别尺码填充
  size1: string;
  size2: string;
  size3: string;
  size4: string;
  size5: string;
  setSize1: (v: string) => void;
  setSize2: (v: string) => void;
  setSize3: (v: string) => void;
  setSize4: (v: string) => void;
  setSize5: (v: string) => void;
  commonSizes: string[];
  setCommonSizes: (v: string[]) => void;
}

/**
 * 款式基础信息表单的业务逻辑 Hook。
 * 抽离自原 StyleBasicInfoForm 组件，包含：
 *  1. 颜色/尺码变化时自动同步 size-color-config 接口的防抖 effect
 *  2. applyStyleParseResult：智能识别结果填充逻辑
 *  3. handleStyleParseResult：透传给父组件的包装函数
 *  4. useImperativeHandle：通过 forwardedRef 暴露 applyStyleParseResult
 *  5. skuRefreshTrigger：触发 SKU 表刷新的内部信号
 */
export function useStyleBasicInfoForm(params: UseStyleBasicInfoFormParams) {
  const {
    _form,
    styleId,
    forwardedRef,
    onStyleParseResult,
    colorOptions,
    sizeOptions,
    sizeColorMatrixRows,
    color1, color2, color3, color4, color5,
    setColor1, setColor2, setColor3, setColor4, setColor5,
    commonColors, setCommonColors,
    size1, size2, size3, size4, size5,
    setSize1, setSize2, setSize3, setSize4, setSize5,
    commonSizes, setCommonSizes,
  } = params;

  const { message } = App.useApp();
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const { options: seasonOptions } = useDictOptions('season', SEASON_CODE_OPTIONS);

  const prevConfigRef = useRef<string>('');
  const isInitialMountRef = useRef(true);
  const [skuRefreshTrigger, setSkuRefreshTrigger] = useState(0);

  // 颜色/尺码/数量变化时自动保存并同步生成 SKU（不调 onRefresh，避免表单重置打断编辑）
  useEffect(() => {
    if (!styleId) return;
    const colorsKey = colorOptions.join(',');
    const sizesKey = sizeOptions.join(',');
    const qtyKey = sizeColorMatrixRows.map((r) => r.quantities.join('|')).join(';');
    const configKey = `${colorsKey}||${sizesKey}||${qtyKey}`;

    // 跳过首次挂载（从后端加载的初始值，不需要回写）
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevConfigRef.current = configKey;
      return;
    }
    if (prevConfigRef.current === configKey) return;

    const sync = async () => {
      try {
        await api.put(`/style/info/${styleId}/size-color-config`, {
          colors: colorOptions,
          sizes: sizeOptions,
          quantities: sizeColorMatrixRows.map((row) => row.quantities.reduce((sum, qty) => sum + Number(qty || 0), 0)),
          matrixRows: sizeColorMatrixRows.map((row) => {
            const hasImage = row.imageUrl && !row.imageUrl.startsWith('data:');
            return {
              color: row.color,
              quantities: row.quantities,
              ...(hasImage ? { imageUrl: row.imageUrl } : {}),
            };
          }),
        });
        // 只刷新 SKU 表，不刷新整个款式数据（避免表单重置）
        setSkuRefreshTrigger((prev) => prev + 1);
      } catch (e: any) {
        message.error(e?.message || '颜色尺码同步失败');
      }
    };

    prevConfigRef.current = configKey;
    const timer = setTimeout(sync, SIZE_COLOR_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [styleId, colorOptions, sizeOptions, sizeColorMatrixRows, message]);

  // 智能识别结果填充：款名/品类/季节/颜色/尺码，面料袖型领型版型图案放备注
  const applyStyleParseResult = (result: StyleFieldParseResult) => {
    if (!result || result.available === false) return;

    const updates: Record<string, any> = {};

    // 款名：仅在当前为空时填充
    if (result.styleName && !_form.getFieldValue('styleName')) {
      updates.styleName = result.styleName;
    }

    // 品类：匹配字典项后填充
    if (result.category && !_form.getFieldValue('category')) {
      const cat = categoryOptions.find((o: any) =>
        o.value === result.category || String(o.label || '').includes(result.category!)
      );
      if (cat) updates.category = cat.value;
    }

    // 季节：匹配字典项后填充
    if (result.season && !_form.getFieldValue('season')) {
      const sea = seasonOptions.find((o: any) =>
        o.value === result.season || String(o.label || '').includes(result.season!)
      );
      if (sea) updates.season = sea.value;
    }

    if (Object.keys(updates).length > 0) {
      _form.setFieldsValue(updates);
    }

    // 颜色列表自动填充（仅当当前颜色表为空时）
    if (result.colors && result.colors.length > 0 && !color1 && !color2 && !color3 && !color4 && !color5) {
      const colorSetterFns = [setColor1, setColor2, setColor3, setColor4, setColor5];
      result.colors.slice(0, 5).forEach((colorName: string, idx: number) => {
        colorSetterFns[idx]?.(colorName);
      });
      const newColorOptions = result.colors.slice(0, 5).filter((c: string) =>
        !commonColors.includes(c)
      );
      if (newColorOptions.length > 0) {
        setCommonColors([...commonColors, ...newColorOptions]);
      }
    }

    // 尺码推荐：根据品类推荐常用尺码（当尺码未配置时）
    if (!size1 && !size2 && !size3 && !size4 && !size5 && result.category) {
      const recommended = DEFAULT_SIZE_MAP[result.category] || FALLBACK_SIZES;
      const sizeSetterFns = [setSize1, setSize2, setSize3, setSize4, setSize5];
      recommended.slice(0, 5).forEach((sizeVal: string, idx: number) => {
        sizeSetterFns[idx]?.(sizeVal);
      });
      const newSizeOptions = recommended.filter((s: string) => !commonSizes.includes(s));
      if (newSizeOptions.length > 0) {
        setCommonSizes([...commonSizes, ...newSizeOptions]);
      }
    }

    // 备注字段：综合面料/袖型/领型/版型/图案 + 置信度
    if (!_form.getFieldValue('remark')) {
      const remarkParts: string[] = [];
      if (result.pattern) remarkParts.push(`图案:${result.pattern}`);
      if (result.fabric) remarkParts.push(`面料:${result.fabric}`);
      if (result.sleeveType) remarkParts.push(`袖型:${result.sleeveType}`);
      if (result.neckline) remarkParts.push(`领型:${result.neckline}`);
      if (result.version) remarkParts.push(`版型:${result.version}`);
      if (typeof result.overallConfidence === 'number') {
        remarkParts.push(`置信度:${result.overallConfidence}%`);
      }
      if (remarkParts.length > 0) {
        _form.setFieldsValue({ remark: remarkParts.join(' | ') });
      }
    }
  };

  useImperativeHandle(forwardedRef, () => ({
    applyStyleParseResult,
  }));

  // 智能识别结果填充：内部回调，也会向上透传给父组件
  const handleStyleParseResult = (result: StyleFieldParseResult) => {
    applyStyleParseResult(result);
    onStyleParseResult?.(result);
  };

  return {
    skuRefreshTrigger,
    applyStyleParseResult,
    handleStyleParseResult,
  };
}
