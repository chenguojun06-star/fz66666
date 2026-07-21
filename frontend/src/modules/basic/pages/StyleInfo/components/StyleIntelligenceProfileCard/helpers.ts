import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import { isStyleInfoCompleted } from '../../../StyleInfoList/components/styleTableViewUtils';
import { formatMoney } from '@/utils/format';
import type { StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';

export const STAGE_MAP = [
  { key: 'bom', label: 'BOM', done: (style: StyleInfo) => Boolean((style as any)?.bomCompletedTime) },
  { key: 'pattern', label: '纸样', done: (style: StyleInfo) => String(style.patternStatus || '').trim().toUpperCase() === 'COMPLETED' },
  { key: 'size', label: '尺寸', done: (style: StyleInfo) => Boolean((style as any)?.sizeCompletedTime) },
  { key: 'production', label: '制单', done: (style: StyleInfo) => Boolean((style as any)?.productionCompletedTime) },
  { key: 'secondary', label: '二次工艺', done: (style: StyleInfo) => Boolean((style as any)?.secondaryCompletedTime) },
  { key: 'process', label: '工序单价', done: (style: StyleInfo) => Boolean((style as any)?.processCompletedTime) },
  { key: 'sizePrice', label: '码数单价', done: (style: StyleInfo) => Boolean((style as any)?.sizePriceCompletedTime) },
  { key: 'sample', label: '样衣生产', done: (style: StyleInfo) => Boolean((style as any)?.sampleCompletedTime) || String((style as any)?.sampleStatus || '').trim().toUpperCase() === 'COMPLETED' },
] as const;

export const fmtMoney = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return formatMoney(value);
};

export const fmtPercent = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
};

export const getDeliveryMeta = (style: StyleInfo | null | undefined, warningDays = 3) => {
  // 完成态款式不再显示任何延期/交期提示
  if (style && isStyleInfoCompleted(style)) {
    return { label: '开发完成', color: 'success' as const, detail: '款式开发节点已走完，交期提示不再适用。' };
  }
  const deliveryDate = style?.deliveryDate;
  if (!deliveryDate) {
    return { label: '待补交期', color: 'default' as const, detail: '当前还没有设置交板日期' };
  }
  const diffDays = dayjs(deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diffDays < 0) {
    return { label: '已延期', color: 'error' as const, detail: `已超期 ${Math.abs(diffDays)} 天` };
  }
  if (diffDays <= warningDays) {
    return { label: '即将超期', color: 'warning' as const, detail: `${diffDays} 天内到期` };
  }
  return { label: '交期正常', color: 'success' as const, detail: `距交期还有 ${diffDays} 天` };
};

export const getProgressMeta = (style: StyleInfo) => {
  const doneCount = STAGE_MAP.filter((item) => item.done(style)).length;
  const percent = Math.round((doneCount / STAGE_MAP.length) * 100);
  if (doneCount === STAGE_MAP.length) {
    return { label: '开发完成', color: 'success' as const, percent };
  }
  if (doneCount >= 4) {
    return { label: '推进中', color: 'processing' as const, percent };
  }
  return { label: '待推进', color: 'warning' as const, percent };
};

export type InsightCategory = 'delivery' | 'progress' | 'quote' | 'process';

export interface StyleInsightItem {
  category: InsightCategory;
  text: string;
}

export const INSIGHT_COLOR: Record<InsightCategory, string> = {
  delivery: 'var(--color-danger)',
  progress: 'var(--color-primary)',
  quote: 'var(--color-warning)',
  process: 'var(--color-accent-purple)',
};

export const INSIGHT_LABEL: Record<InsightCategory, string> = {
  delivery: '交期风险',
  progress: '开发进度',
  quote: '报价',
  process: '工序',
};

// 基于开发节点（STAGE_MAP）生成洞察，不查大货订单数据
export const buildFallbackInsights = (style: StyleInfo, quote: StyleQuoteSuggestionResponse | null): StyleInsightItem[] => {
  const insights: StyleInsightItem[] = [];
  const deliveryMeta = getDeliveryMeta(style);

  // 1. 交期洞察（开发阶段的交板日期）
  if (deliveryMeta.label === '已延期') {
    insights.push({ category: 'delivery', text: '交板已失守，建议优先检查纸样、工序单价和生产制单三个关键环节。' });
  } else if (deliveryMeta.label === '即将超期') {
    insights.push({ category: 'delivery', text: '已进入临界交期窗口，建议今天内锁定未完成的开发节点。' });
  }

  // 2. 开发进度洞察（基于 STAGE_MAP，不查大货订单）
  const stages = STAGE_MAP.map((item) => ({ key: item.key, label: item.label, done: item.done(style) }));
  const doneCount = stages.filter((s) => s.done).length;
  const totalCount = stages.length;
  const pendingStages = stages.filter((s) => !s.done).map((s) => s.label);

  if (doneCount < totalCount) {
    if (doneCount === 0) {
      insights.push({ category: 'progress', text: `${totalCount} 个开发节点均未启动，建议从 BOM 和纸样开始推进。` });
    } else if (doneCount < 4) {
      insights.push({ category: 'progress', text: `已完成 ${doneCount}/${totalCount}，待推进：${pendingStages.slice(0, 3).join('、')}。` });
    } else {
      insights.push({ category: 'progress', text: `已完成 ${doneCount}/${totalCount}，收尾阶段：${pendingStages.slice(0, 2).join('、')}。` });
    }
  }

  // 3. 工序单价洞察
  if (!(style as any)?.processCompletedTime) {
    insights.push({ category: 'process', text: '工序单价尚未锁定，影响后续大货结算与报价准确性。' });
  }

  // 4. 报价洞察
  if (quote?.suggestedPrice != null && quote?.currentQuotation != null) {
    const diff = Number(quote.suggestedPrice) - Number(quote.currentQuotation);
    if (Math.abs(diff) >= 1) {
      insights.push({
        category: 'quote',
        text: diff > 0 ? 'AI 建议报价高于当前报价，建议复核利润空间和二次工艺损耗。' : 'AI 建议报价低于当前报价，可结合历史样本复核市场接受度。',
      });
    }
  }

  return insights.slice(0, 4);
};

export const difficultyColor = (level?: string) => {
  if (level === 'SIMPLE') return 'green';
  if (level === 'MEDIUM') return 'blue';
  if (level === 'COMPLEX') return 'orange';
  if (level === 'HIGH_END') return 'red';
  return 'default';
};

export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--color-danger)',
  HIGH: '#ff7a45',
  MEDIUM: 'var(--color-warning)',
  LOW: 'var(--color-success)',
  NONE: 'var(--color-border-antd)',
};

/** 把后端返回的 insights 数组规范化为 StyleInsightItem[] */
export const normalizeInsights = (rawInsights: any[] | undefined, fallback: StyleInsightItem[]): StyleInsightItem[] => {
  const merged: StyleInsightItem[] = Array.isArray(rawInsights) && rawInsights.length > 0
    ? rawInsights.map((it: any) => ({
        category: (it.category || it.type || 'progress') as InsightCategory,
        text: String(it.text || it.message || it.content || '').trim(),
      })).filter((it: StyleInsightItem) => it.text)
    : fallback;
  return merged.length > 0 ? merged : [{ category: 'progress' as InsightCategory, text: '暂无明显风险信号，继续保持当前节奏。' }];
};
