import type { SchedulePlan } from '@/services/intelligence/intelligenceApi';

interface FactoryOptionLike {
  id?: string | number;
  factoryName: string;
}

export interface SchedulingInsightItem {
  key: string;
  rank: number;
  factoryId?: string;
  factoryName: string;
  score: number;
  currentLoadText: string;
  availableCapacityText: string;
  dailyCapacityText: string;
  estimatedText: string;
  sourceLabel: string;
  sourceTone: string;
  dataNote?: string;
  selected: boolean;
  pinned: boolean;
}

const formatInt = (value: unknown) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
};

const resolveSourceMeta = (plan: SchedulePlan) => {
  if (plan.capacitySource === 'real') {
    return { label: '实测', tone: '#1677ff' };
  }
  if (plan.capacitySource === 'configured') {
    return { label: '已配置', tone: '#52c41a' };
  }
  return { label: '估算', tone: '#d48806' };
};

export const buildSchedulingInsightItems = (
  plans: SchedulePlan[],
  factories: FactoryOptionLike[],
  selectedFactoryId?: string,
): SchedulingInsightItem[] => {
  const normalizedSelectedFactoryId = String(selectedFactoryId || '');
  const allItems = (plans || []).map((plan, index) => {
    const matchedFactory = factories.find((factory) => String(factory.factoryName || '').trim() === String(plan.factoryName || '').trim());
    const sourceMeta = resolveSourceMeta(plan);
    const factoryId = matchedFactory?.id == null ? undefined : String(matchedFactory.id);
    const dailyCapacity = Number(plan.realDailyCapacity || plan.dailyCapacity || 0);
    const selected = !!factoryId && factoryId === normalizedSelectedFactoryId;

    return {
      key: `${plan.factoryName || 'factory'}-${index}`,
      rank: index + 1,
      factoryId,
      factoryName: plan.factoryName || '-',
      score: Number(plan.matchScore || 0),
      currentLoadText: `${formatInt(plan.currentLoad)} 件`,
      availableCapacityText: `${formatInt(plan.availableCapacity)} 件`,
      dailyCapacityText: `${formatInt(dailyCapacity)} 件/天`,
      estimatedText: plan.estimatedEnd ? `${plan.suggestedStart} → ${plan.estimatedEnd}` : `${plan.estimatedDays || 0} 天`,
      sourceLabel: sourceMeta.label,
      sourceTone: sourceMeta.tone,
      dataNote: plan.dataNote || undefined,
      selected,
      pinned: selected,
    };
  });

  const selectedItem = allItems.find((item) => item.selected);
  const restItems = allItems.filter((item) => !item.selected);

  return selectedItem
    ? [selectedItem, ...restItems.slice(0, 2)]
    : restItems.slice(0, 3);
};
