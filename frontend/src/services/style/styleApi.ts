import api from '../../utils/api';

const normalizeStyleLookupKey = (value?: string | number | null) => String(value ?? '').trim();

const pickStyleFromList = (payload: any, expectedStyleNo: string) => {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (!records.length) return null;
  if (!expectedStyleNo) return records[0] ?? null;
  return records.find((item: any) => String(item?.styleNo ?? '').trim() === expectedStyleNo) ?? records[0] ?? null;
};

export const getStyleInfoByRef = async (styleRef?: string | number | null, styleNoFallback?: string | null) => {
  const preferredStyleNo = normalizeStyleLookupKey(styleNoFallback);
  const key = normalizeStyleLookupKey(styleRef);
  const lookupStyleNo = preferredStyleNo || (/^\d+$/.test(key) ? '' : key);

  if (lookupStyleNo) {
    try {
      const res = await api.get<{ code: number; data?: { records?: any[] } }>('/style/info/list', {
        params: { styleNo: lookupStyleNo, page: 1, pageSize: 5 },
      });
      if (res?.code === 200) {
        return pickStyleFromList(res.data, lookupStyleNo);
      }
    } catch {
      // Intentionally empty
    }
  }

  if (key && /^\d+$/.test(key)) {
    try {
      const res = await api.get<{ code: number; data?: any }>(`/style/info/${encodeURIComponent(key)}`);
      if (res?.code === 200 && res.data) {
        return res.data;
      }
    } catch {
      // Intentionally empty
    }
  }

  return null;
};

export const styleProcessApi = {
  listByStyleId: (styleId: string) => api.get<{ code: number; data: any[] }>('/style/process/list', { params: { styleId } }),
};

export default {
  getStyleInfoByRef,
  styleProcessApi,
};

