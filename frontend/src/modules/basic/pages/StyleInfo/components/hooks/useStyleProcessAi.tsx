import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Tag, Space } from 'antd';
import { modal } from '@/utils/antdStatic';
import { intelligenceApi, ProcessPriceHintResponse, ProcessTemplateItem, ProcessTemplateGroup, ProcessTemplateResponse } from '@/services/intelligence/intelligenceApi';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { StyleProcessWithSizePrice } from '../styleProcessTabUtils';

const STAGE_COLOR: Record<string, string> = {
  裁剪: 'orange',
  车缝: 'blue',
  尾部: 'purple',
  入库: 'green',
  采购: 'cyan',
};

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

  useEffect(() => {
    const timers = hintTimerRef.current;
    return () => { Object.values(timers).forEach(t => clearTimeout(t)); };
  }, []);

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
      const res = await intelligenceApi.getProcessTemplate(aiCategory, String(styleId)) as any;
      const respData = res?.data as ProcessTemplateResponse | undefined;
      if (res?.code === 200 && Array.isArray(respData?.processes) && respData!.processes.length > 0) {
        const incoming: ProcessTemplateItem[] = respData!.processes;
        const grouped: ProcessTemplateGroup[] = respData!.groupedProcesses || [];
        setAiOpen(false);

        const matchType = respData!.matchType || 'category_only';
        const difficultyLabel = respData!.difficultyLabel || '';
        const sampleCount = respData!.sampleStyleCount ?? 0;
        let matchDesc = '';
        if (matchType === 'category_difficulty' && difficultyLabel) {
          matchDesc = `同品类 · 同难度（${difficultyLabel}）`;
        } else if (matchType === 'category_only') {
          matchDesc = '同品类全部';
        } else {
          matchDesc = '全部历史';
        }

        // 计算有多少工序是已存在的（会保留用户改的价格）
        const existingNames = new Map<string, StyleProcessWithSizePrice>();
        data.forEach(r => {
          const name = String(r.processName || '').trim();
          if (name) existingNames.set(name, r);
        });

        const overlapCount = incoming.filter(p => existingNames.has(String(p.processName || '').trim())).length;
        const newCount = incoming.length - overlapCount;

        modal.confirm({
          title: `AI 推荐 ${incoming.length} 道完整工序`,
          width: 560,
          content: (<div>
            <p style={{ marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              数据来源：本厂历史数据 · {matchDesc} · {sampleCount} 个样本参考
            </p>
            <p style={{ marginBottom: 12, color: 'var(--color-warning)', fontSize: 13 }}>
              ⚠ 确认后将<strong>替换当前所有工序</strong>（共 {data.length} 道）。
              {overlapCount > 0 && ` 其中 ${overlapCount} 道同名工序将保留你已设置的价格，`}
              {newCount > 0 && `新增 ${newCount} 道工序。`}
            </p>
            <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 8 }}>
              {grouped.length > 0 ? grouped.map((g, gi) => (
                <div key={gi} style={{ marginBottom: 12 }}>
                  <Space style={{ marginBottom: 6 }}>
                    <Tag color={STAGE_COLOR[g.parentNode] || 'default'} style={{ fontSize: 13, fontWeight: 600 }}>
                      {g.parentNode}
                    </Tag>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {g.items.length} 道
                    </span>
                  </Space>
                  <div style={{ paddingLeft: 8 }}>
                    {g.items.map((p, pi) => (
                      <div key={pi} style={{ color: 'var(--color-text-secondary)', lineHeight: '22px', fontSize: 13 }}>
                        • {p.processName}
                        <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                          参考价 ¥{p.suggestedPrice ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )) : incoming.map((p, i) => (
                <div key={i} style={{ color: 'var(--color-text-secondary)', lineHeight: '24px' }}>
                  • {p.progressStage || '车缝'} - {p.processName}（参考价 ¥{p.suggestedPrice ?? 0}）
                </div>
              ))}
            </div>
          </div>),
          okText: '确认替换',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            if (!editMode) await enterEdit();
            setData(() => {
              // 构建新数组：按分组顺序排列，同名工序保留用户已设价格
              const newRows: StyleProcessWithSizePrice[] = [];
              let sortOrder = 10;
              // 优先用分组后的顺序，没有就用扁平列表
              const ordered: ProcessTemplateItem[] = grouped.length > 0
                ? grouped.flatMap(g => g.items)
                : incoming;
              for (const p of ordered) {
                const name = String(p.processName || '').trim();
                const existing = existingNames.get(name);
                newRows.push({
                  id: -(Date.now() + sortOrder) as unknown as number,
                  styleId: Number(styleId),
                  processCode: '',
                  processName: p.processName,
                  progressStage: p.progressStage ?? '',
                  // 保留用户已设置的价格（如果存在），否则用建议价
                  price: existing && existing.price != null ? existing.price : p.suggestedPrice,
                  standardTime: existing && existing.standardTime != null ? existing.standardTime : p.avgStandardTime,
                  sortOrder: sortOrder,
                } as any);
                sortOrder += 10;
              }
              return newRows;
            });
            setTimeout(() => { message.success(`已替换为 ${incoming.length} 道 AI 推荐工序（${matchDesc} · ${sampleCount} 个样本参考）`); }, 0);
          },
        });
      } else { message.warning({ content: '暂无该品类的工序历史数据，请先在「工序单价」页面录入实际工序', duration: 5 }); }
    } catch { message.error('AI推荐失败，请稍后重试'); } finally { setAiLoading(false); }
  }, [aiCategory, styleId, message, data, editMode, enterEdit]);

  return { aiOpen, setAiOpen, aiCategory, setAiCategory, aiLoading, priceHints, priceHintLoading, categoryOptions, fetchPriceHint, handleAiTemplate };
};
