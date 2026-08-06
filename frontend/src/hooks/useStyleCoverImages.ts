/**
 * useStyleCoverImages — 通用款号封面图反查 Hook
 *
 * 用途：电商各页面通过 skuCode/styleNo 反查款号封面图（cover 字段）
 * 数据源：/style/info/list API（按 styleNo 查询，取 cover 字段）
 *
 * 用法：
 *   const { imageMap, fetchBySkuCodes, fetchByStyleNos } = useStyleCoverImages();
 *   // 数据加载后调用
 *   useEffect(() => { fetchBySkuCodes(records.map(r => r.skuCode)); }, [records]);
 *   // 渲染时查图
 *   <StyleImageCell styleNo={styleNo} imageMap={imageMap} />
 */
import { useState, useCallback, useRef } from 'react';
import api from '@/utils/api';

/** styleNo → cover URL 映射 */
export type StyleImageMap = Record<string, string>;

/** 从 skuCode 提取 styleNo（约定：skuCode = styleNo-color-size，按 - 拆分第一段） */
export function extractStyleNoFromSkuCode(skuCode: string | null | undefined): string {
  if (!skuCode) return '';
  return (skuCode.split('-')[0] || '').trim();
}

export interface UseStyleCoverImagesReturn {
  /** styleNo → cover URL 映射 */
  imageMap: StyleImageMap;
  /** 按 skuCode 数组批量反查（内部会拆分出 styleNo） */
  fetchBySkuCodes: (skuCodes: Array<string | null | undefined>) => Promise<void>;
  /** 按 styleNo 数组批量反查 */
  fetchByStyleNos: (styleNos: Array<string | null | undefined>) => Promise<void>;
  /** 手动设置映射（用于已有数据的合并） */
  setImageMap: React.Dispatch<React.SetStateAction<StyleImageMap>>;
  /** 是否正在加载 */
  loading: boolean;
}

export function useStyleCoverImages(): UseStyleCoverImagesReturn {
  const [imageMap, setImageMap] = useState<StyleImageMap>({});
  const [loading, setLoading] = useState(false);
  // 已查询过的 styleNo 集合，避免重复请求
  const fetchedRef = useRef<Set<string>>(new Set());

  const fetchByStyleNos = useCallback(async (styleNos: Array<string | null | undefined>) => {
    const unique = Array.from(new Set(
      styleNos
        .map(s => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
    )).filter(sn => !fetchedRef.current.has(sn));

    if (unique.length === 0) return;

    setLoading(true);
    try {
      const results = await Promise.allSettled(
        unique.map(sn =>
          api.get('/style/info/list', { params: { styleNo: sn, pageSize: 5 } })
        )
      );
      const map: StyleImageMap = {};
      results.forEach((res, i) => {
        const sn = unique[i];
        fetchedRef.current.add(sn);
        if (res.status === 'fulfilled') {
          const records: Array<{ styleNo: string; cover?: string }> =
            (res.value as any)?.data?.records ?? [];
          const exact = records.find(s => s.styleNo === sn);
          if (exact?.cover) map[sn] = exact.cover;
        }
      });
      if (Object.keys(map).length > 0) {
        setImageMap(prev => ({ ...prev, ...map }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBySkuCodes = useCallback(async (skuCodes: Array<string | null | undefined>) => {
    const styleNos = skuCodes.map(extractStyleNoFromSkuCode).filter(Boolean);
    await fetchByStyleNos(styleNos);
  }, [fetchByStyleNos]);

  return {
    imageMap,
    fetchBySkuCodes,
    fetchByStyleNos,
    setImageMap,
    loading,
  };
}

export default useStyleCoverImages;
