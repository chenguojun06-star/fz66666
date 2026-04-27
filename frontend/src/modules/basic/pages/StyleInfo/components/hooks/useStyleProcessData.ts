import { useCallback, useEffect, useState } from 'react';
import { App } from 'antd';
import { StyleProcess, TemplateLibrary } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import type { SizePrice, StyleProcessWithSizePrice } from '../styleProcessTabUtils';

type UseStyleProcessDataParams = {
  styleId: number | string;
  onDataLoaded?: (data: StyleProcessWithSizePrice[]) => void;
};

export const useStyleProcessData = ({ styleId, onDataLoaded }: UseStyleProcessDataParams) => {
  const { message } = App.useApp();
  const [data, setData] = useState<StyleProcessWithSizePrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [sizes, setSizes] = useState<string[]>([]);
  const [processTemplates, setProcessTemplates] = useState<TemplateLibrary[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [sizeOptions, setSizeOptions] = useState<Array<{ value: string; label: string }>>([]);

  const fetchSizeDictOptions = async () => {
    try {
      const res = await api.get<{ code: number; data: { records: any[] } | any[] }>('/system/dict/list', { params: { dictType: 'size', page: 1, pageSize: 200 } });
      const result = res as any;
      if (result.code === 200) {
        const d = result.data as { records?: any[] } | any[];
        const records = Array.isArray(d) ? d : ((d as { records?: any[] })?.records || []);
        const options = (Array.isArray(records) ? records : []).filter((item: any) => item.dictLabel).map((item: any) => ({ value: item.dictLabel, label: item.dictLabel }));
        setSizeOptions(options);
      }
    } catch {}
  };

  const fetchProcess = useCallback(async () => {
    setLoading(true);
    try {
      const [processRes, sizePriceRes, sizeTableRes] = await Promise.all([
        api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`),
        api.get<{ code: number; data: SizePrice[] }>(`/style/size-price/list`, { params: { styleId } }),
        api.get<{ code: number; data: Array<{ sizeName: string }> }>(`/style/size/list?styleId=${styleId}`),
      ]);
      const processResult = processRes as any;
      const sizePriceResult = sizePriceRes as any;
      const sizeTableResult = sizeTableRes as any;
      if (processResult.code === 200) {
        const processData = (processResult.data || []) as StyleProcess[];
        let sizePriceData: SizePrice[] = [];
        if (sizePriceResult.code === 200 && sizePriceResult.data) sizePriceData = sizePriceResult.data as SizePrice[];
        let sizeList: string[] = [];
        if (sizeTableResult.code === 200 && sizeTableResult.data) {
          const sizeSet = new Set<string>();
          sizeTableResult.data.forEach((item: any) => {
            const sizeName = String(item.sizeName || '').trim();
            if (sizeName) { const parts = sizeName.split(/[,，\s]+/).map((s: string) => s.trim()).filter(Boolean); parts.forEach((s: string) => sizeSet.add(s)); }
          });
          if (sizeSet.size > 0) sizeList = Array.from(sizeSet).sort((a, b) => { const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL']; const ia = order.indexOf(a.toUpperCase()); const ib = order.indexOf(b.toUpperCase()); if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0) return -1; if (ib >= 0) return 1; return a.localeCompare(b); });
        }
        if (sizeList.length === 0 && sizePriceData.length > 0) {
          const savedSizes = new Set<string>();
          sizePriceData.forEach((sp: SizePrice) => { if (sp.size) savedSizes.add(sp.size.trim()); });
          if (savedSizes.size > 0) sizeList = Array.from(savedSizes).sort((a, b) => { const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL']; const ia = order.indexOf(a); const ib = order.indexOf(b); if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0) return -1; if (ib >= 0) return 1; return a.localeCompare(b); });
        }
        setSizes(sizeList);
        const mergedData: StyleProcessWithSizePrice[] = processData.map((proc) => {
          const sizePrices: Record<string, number> = {};
          const sizePriceTouched: Record<string, boolean> = {};
          sizeList.forEach((size) => { const found = sizePriceData.find((sp) => sp.processCode === proc.processCode && sp.size === size); sizePrices[size] = found ? toNumberSafe(found.price) : toNumberSafe(proc.price); sizePriceTouched[size] = Boolean(found); });
          return { ...proc, sizePrices, sizePriceTouched };
        });
        const sortedData = [...mergedData].sort((a, b) => toNumberSafe(a.sortOrder) - toNumberSafe(b.sortOrder)).map((row, index) => ({ ...row, sortOrder: index + 1, processCode: String(index + 1).padStart(2, '0') }));
        setData(sortedData);
        onDataLoaded?.(sortedData);
      }
    } catch { message.error('获取工序表失败'); } finally { setLoading(false); }
  }, [styleId, message, onDataLoaded]);

  const fetchProcessTemplates = async (sourceStyleNo?: string) => {
    const sn = String(sourceStyleNo ?? '').trim();
    setTemplateLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } | unknown[] }>('/template-library/list', { params: { page: 1, pageSize: 200, templateType: 'process', keyword: '', sourceStyleNo: sn } });
      const result = res as any;
      if (result.code === 200) {
        const d = result.data as { records?: unknown[] } | unknown[];
        const records = Array.isArray(d) ? d : ((d as { records?: unknown[] })?.records || []);
        setProcessTemplates(Array.isArray(records) ? records as TemplateLibrary[] : []);
        return;
      }
    } catch {} finally { setTemplateLoading(false); }
    try {
      const res = await api.get<{ code: number; data: any[] }>('/template-library/type/process');
      const result = res as any;
      if (result.code === 200) setProcessTemplates(Array.isArray(result.data) ? result.data : []);
    } catch {}
  };

  useEffect(() => { fetchProcess(); }, [styleId]);
  useEffect(() => { fetchProcessTemplates(''); }, []);

  return { data, setData, loading, sizes, setSizes, sizeOptions, setSizeOptions, fetchSizeDictOptions, fetchProcess, processTemplates, templateLoading, fetchProcessTemplates };
};
