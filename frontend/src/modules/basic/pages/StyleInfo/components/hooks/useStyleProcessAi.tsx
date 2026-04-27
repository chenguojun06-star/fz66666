import React from 'react';
import { useCallback, useRef, useState } from 'react';
import { App } from 'antd';
import { modal } from '@/utils/antdStatic';
import { intelligenceApi, ProcessPriceHintResponse, ProcessTemplateItem } from '@/services/intelligence/intelligenceApi';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { StyleProcessWithSizePrice } from '../styleProcessTabUtils';

type UseStyleProcessAiParams = {
  styleId: number | string;
  data: StyleProcessWithSizePrice[];
  editMode: boolean;
  enterEdit: () => Promise<void>;
};

export const useStyleProcessAi = ({ styleId, data, editMode, enterEdit }: UseStyleProcessAiParams) => {
  const { message } = App.useApp();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCategory, setAiCategory] = useState<string | undefined>(undefined);
  const [aiLoading, setAiLoading] = useState(false);
  const [priceHints, setPriceHints] = useState<Record<string | number, ProcessPriceHintResponse | null>>({});
  const [priceHintLoading, setPriceHintLoading] = useState<Record<string | number, boolean>>({});
  const hintTimerRef = useRef<Record<string | number, ReturnType<typeof setTimeout>>>({});
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);

  const fetchPriceHint = useCallback((rowId: string | number, processName: string, standardTime?: number) => {
    if (hintTimerRef.current[rowId]) clearTimeout(hintTimerRef.current[rowId]);
    if (!processName || processName.trim().length < 1) { setPriceHints(prev => ({ ...prev, [rowId]: null })); return; }
    hintTimerRef.current[rowId] = setTimeout(async () => {
      setPriceHintLoading(prev => ({ ...prev, [rowId]: true }));
      try {
        const res = await intelligenceApi.getProcessPriceHint(processName.trim(), standardTime) as any;
        if (res?.code === 200 && res.data?.usageCount > 0) setPriceHints(prev => ({ ...prev, [rowId]: res.data as ProcessPriceHintResponse }));
        else setPriceHints(prev => ({ ...prev, [rowId]: null }));
      } catch { setPriceHints(prev => ({ ...prev, [rowId]: null })); } finally { setPriceHintLoading(prev => ({ ...prev, [rowId]: false })); }
    }, 600);
  }, []);

  const handleAiTemplate = useCallback(async (setData: React.Dispatch<React.SetStateAction<StyleProcessWithSizePrice[]>>) => {
    setAiLoading(true);
    try {
      const res = await intelligenceApi.getProcessTemplate(aiCategory) as any;
      if (res?.code === 200 && Array.isArray(res.data?.processes) && res.data.processes.length > 0) {
        const incoming: ProcessTemplateItem[] = res.data.processes;
        const existingNames = new Set(data.map(r => String(r.processName || '').trim()));
        const preview = incoming.filter(p => !existingNames.has(String(p.processName || '').trim()));
        setAiOpen(false);
        if (preview.length === 0) { message.info('所有工序已存在，无需重复补全'); return; }
        modal.confirm({
          title: `AI建议补全 ${preview.length} 道工序`,
          content: (<div><p style={{ marginBottom: 8 }}>以下工序将被添加，请确认：</p>{preview.map((p, i) => (<div key={i} style={{ color: '#555', lineHeight: '24px' }}>• {p.progressStage || '车缝'} - {p.processName}（建议单价 ¥{p.suggestedPrice ?? 0}）</div>))}</div>),
          okText: '确认添加', cancelText: '取消',
          onOk: async () => {
            if (!editMode) await enterEdit();
            let addedCount = 0;
            setData(prev => {
              const existingNamesNow = new Set(prev.map(r => String(r.processName || '').trim()));
              const base = prev.length;
              const toAdd: StyleProcessWithSizePrice[] = incoming.filter(p => !existingNamesNow.has(String(p.processName || '').trim())).map((p, idx) => ({ id: -(Date.now() + idx) as unknown as number, styleId: Number(styleId), processCode: '', processName: p.processName, progressStage: p.progressStage ?? '', price: p.suggestedPrice, standardTime: p.avgStandardTime, sortOrder: (base + idx + 1) * 10 } as any));
              addedCount = toAdd.length;
              return [...prev, ...toAdd];
            });
            setTimeout(() => { message.success(`已添加 ${addedCount} 道AI建议工序（${res.data.category || aiCategory || '历史数据'} · ${res.data.sampleStyleCount ?? '?'} 个样本）`); }, 0);
          },
        });
      } else { message.warning('暂无该品类的工序历史数据'); }
    } catch { message.error('AI补全失败，请稍后重试'); } finally { setAiLoading(false); }
  }, [aiCategory, styleId, message, data, editMode, enterEdit]);

  return { aiOpen, setAiOpen, aiCategory, setAiCategory, aiLoading, priceHints, priceHintLoading, categoryOptions, fetchPriceHint, handleAiTemplate };
};
