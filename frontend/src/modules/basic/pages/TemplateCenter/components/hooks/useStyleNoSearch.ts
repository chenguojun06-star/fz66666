import { useCallback, useRef, useState } from 'react';
import api from '@/utils/api';

export interface StyleNoOption {
  value: string;
  label: string;
}

export function useStyleNoSearch() {
  const [styleInputVal, setStyleInputVal] = useState('');
  const [styleNoOptions, setStyleNoOptions] = useState<StyleNoOption[]>([]);
  const [_styleNoLoading, setStyleNoLoading] = useState(false);
  const [selectedStyleNo, setSelectedStyleNo] = useState('');
  const styleNoSeq = useRef(0);
  const styleNoTimer = useRef<number | undefined>(undefined);

  const fetchStyleNoOptions = useCallback(async (keyword: string) => {
    const seq = (styleNoSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<any>('/template-library/process-price-style-options', {
        params: { keyword: keyword.trim() },
      });
      if (seq !== styleNoSeq.current) return;
      const records: any[] = Array.isArray(res?.data) ? res.data : [];
      setStyleNoOptions(
        records
          .map((record: any) => {
            const styleNo = String(record?.styleNo || '').trim();
            const styleName = String(record?.styleName || '').trim();
            return { value: styleNo, label: styleName ? `${styleNo}（${styleName}）` : styleNo };
          })
          .filter((record: any) => record.value)
      );
    } catch {
      // ignore
    } finally {
      if (seq === styleNoSeq.current) setStyleNoLoading(false);
    }
  }, []);

  const scheduleStyleSearch = useCallback((keyword: string) => {
    if (styleNoTimer.current) window.clearTimeout(styleNoTimer.current);
    styleNoTimer.current = window.setTimeout(() => fetchStyleNoOptions(keyword), 250);
  }, [fetchStyleNoOptions]);

  return {
    styleInputVal,
    setStyleInputVal,
    styleNoOptions,
    selectedStyleNo,
    setSelectedStyleNo,
    fetchStyleNoOptions,
    scheduleStyleSearch,
  };
}
