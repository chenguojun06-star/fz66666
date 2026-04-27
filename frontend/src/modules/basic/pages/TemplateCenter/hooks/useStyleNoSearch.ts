import { useCallback, useRef, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';

export const useStyleNoSearch = () => {
  const { message } = App.useApp();
  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);

  const fetchStyleNoOptions = useCallback(async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: Array<{ styleNo: string; styleName?: string }> }>('/template-library/process-price-style-options', {
        params: { keyword: String(keyword ?? '').trim() },
      });
      if (seq !== styleNoReqSeq.current) return;
      if (res.code !== 200) return;
      const records = Array.isArray(res.data) ? res.data : [];
      const next = (Array.isArray(records) ? records : [])
        .map((r) => {
          const styleNo = String(r?.styleNo || '').trim();
          const styleName = String(r?.styleName || '').trim();
          return styleNo ? { value: styleNo, label: styleName ? `${styleNo}（${styleName}）` : styleNo } : null;
        })
        .filter(Boolean) as Array<{ value: string; label: string }>;
      setStyleNoOptions(next);
    } catch {
      message.warning('款号搜索失败，请手动输入');
    } finally {
      if (seq === styleNoReqSeq.current) setStyleNoLoading(false);
    }
  }, []);

  const scheduleFetchStyleNos = (keyword: string) => {
    if (styleNoTimerRef.current != null) {
      window.clearTimeout(styleNoTimerRef.current);
    }
    styleNoTimerRef.current = window.setTimeout(() => {
      fetchStyleNoOptions(keyword);
    }, 250);
  };

  return {
    styleNoOptions,
    styleNoLoading,
    fetchStyleNoOptions,
    scheduleFetchStyleNos,
  };
};
