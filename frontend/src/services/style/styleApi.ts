import api, { unwrapApiData } from '../../utils/api';
import type { StyleInfo, StyleProcess } from '../../types/style';
import type { PaginatedData } from '../../types/api';

const normalizeStyleLookupKey = (value?: string | number | null) => String(value ?? '').trim();

const pickStyleFromList = (payload: PaginatedData<StyleInfo> | undefined | null, expectedStyleNo: string): StyleInfo | null => {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (!records.length) return null;
  if (!expectedStyleNo) return records[0] ?? null;
  return records.find((item) => String(item?.styleNo ?? '').trim() === expectedStyleNo) ?? records[0] ?? null;
};

export const getStyleInfoByRef = async (styleRef?: string | number | null, styleNoFallback?: string | null): Promise<StyleInfo | null> => {
  const preferredStyleNo = normalizeStyleLookupKey(styleNoFallback);
  const key = normalizeStyleLookupKey(styleRef);
  const lookupStyleNo = preferredStyleNo || (/^\d+$/.test(key) ? '' : key);

  if (lookupStyleNo) {
    try {
      const data = await unwrapApiData<PaginatedData<StyleInfo>>(await api.get('/style/info/list', {
        params: { styleNo: lookupStyleNo, page: 1, pageSize: 5 },
      }), '款式查询失败');
      return pickStyleFromList(data, lookupStyleNo);
    } catch (err) {
      console.warn('[styleApi] 款式按编号查询失败:', (err as Error)?.message || err);
    }
  }

  if (key && /^\d+$/.test(key)) {
    try {
      const data = await unwrapApiData<StyleInfo | null>(await api.get(`/style/info/${encodeURIComponent(key)}`), '款式查询失败');
      if (data) {
        return data;
      }
    } catch (err) {
      console.warn('[styleApi] 款式按ID查询失败:', (err as Error)?.message || err);
    }
  }

  return null;
};

export const styleProcessApi = {
  listByStyleId: async (styleId: string): Promise<StyleProcess[]> =>
    unwrapApiData<StyleProcess[]>(await api.get('/style/process/list', { params: { styleId } }), '工序列表加载失败'),
};

export default {
  getStyleInfoByRef,
  styleProcessApi,
};
