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

/**
 * 自动收录词典新词（幂等，已存在则后端跳过）
 * 调用后静默失败，不影响主流程
 */
export function autoCollectDictEntry(dictType: string, label: string): void {
  if (!dictType || !label || !label.trim()) return;
  const trimmed = label.trim();
  if (!isValidDictLabel(trimmed)) return;
  api
    .post('/system/dict/auto-collect', null, { params: { dictType, label: trimmed } })
    .catch(() => { /* 静默失败，不影响用户操作 */ });
}

function isValidDictLabel(label: string): boolean {
  if (label.length > 50 || label.length < 1) return false;
  let validCount = 0;
  for (const c of label) {
    const code = c.charCodeAt(0);
    if ((code >= 0x4e00 && code <= 0x9fa5) || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
      validCount++;
    } else if (!/[-_/\s()（）#.]/.test(c)) {
      return false;
    }
  }
  return validCount > 0;
}
