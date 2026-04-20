import api from '../../utils/api';
import type { StyleInfo, StyleProcess } from '../../types/style';
import type { ApiResponse, PaginatedData } from '../../types/api';

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
      const res = await api.get<ApiResponse<PaginatedData<StyleInfo>>>('/style/info/list', {
        params: { styleNo: lookupStyleNo, page: 1, pageSize: 5 },
      });
      if (res?.code === 200) {
        return pickStyleFromList(res.data, lookupStyleNo);
      }
    } catch (err) {
      console.warn('[styleApi] 款式按编号查询失败:', (err as Error)?.message || err);
    }
  }

  if (key && /^\d+$/.test(key)) {
    try {
      const res = await api.get<ApiResponse<StyleInfo>>(`/style/info/${encodeURIComponent(key)}`);
      if (res?.code === 200 && res.data) {
        return res.data;
      }
    } catch (err) {
      console.warn('[styleApi] 款式按ID查询失败:', (err as Error)?.message || err);
    }
  }

  return null;
};

export const styleProcessApi = {
  listByStyleId: (styleId: string) => api.get<ApiResponse<StyleProcess[]>>('/style/process/list', { params: { styleId } }),
};

export default {
  getStyleInfoByRef,
  styleProcessApi,
};
