import { useState, useEffect } from 'react';
import api from '@/utils/api';

export interface DictOption {
  label: string;
  value: string;
}

/**
 * 从字典 API 加载选项列表，存储 code 作为表单值（与数据库一致）。
 * @param dictType 字典类型，如 'category' / 'season'
 * @param fallback  API 异常或返回空时的保底选项（通常是硬编码列表）
 */
export function useDictOptions(dictType: string, fallback: DictOption[] = []): {
  options: DictOption[];
  loading: boolean;
} {
  const [options, setOptions] = useState<DictOption[]>(fallback);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dictType) return;
    setLoading(true);
    api
      .get('/system/dict/list', { params: { dictType, pageSize: 999, page: 1 } })
      .then((res: any) => {
        const records: any[] = res?.data?.records || res?.records || [];
        if (records.length > 0) {
          const raw = records
            .filter((r: any) => r.dictCode && r.dictLabel)
            .sort((a: any, b: any) => (Number(a.sort) || 0) - (Number(b.sort) || 0))
            .map((r: any) => ({ value: r.dictCode, label: r.dictLabel }));
          // 按 label 去重，保留第一个（sort 最小值已在前）
          const seenLabels = new Set<string>();
          setOptions(
            raw.filter((opt: { value: string; label: string }) => {
              if (seenLabels.has(opt.label)) return false;
              seenLabels.add(opt.label);
              return true;
            })
          );
        }
        // 空列表时保持 fallback 不变
      })
      .catch(() => {
        /* 保持 fallback */
      })
      .finally(() => setLoading(false));
  }, [dictType]);

  return { options, loading };
}
