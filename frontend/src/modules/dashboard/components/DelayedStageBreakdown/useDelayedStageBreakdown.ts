import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

interface DelayedItem {
  id: string;
  no: string;
  name: string;
  stage: string;
  overdueDays: number;
  plannedEndDate: string;
  factoryName: string;
  type: 'sample' | 'bulk';
  progress: number;
  quantity: number;
}

interface DelayedStageGroup {
  stageName: string;
  count: number;
  items: DelayedItem[];
}

interface DelayedStageBreakdownData {
  sampleDelayed: DelayedStageGroup[];
  bulkDelayed: DelayedStageGroup[];
  sampleTotal: number;
  bulkTotal: number;
}

type TabKey = 'bulk' | 'sample';

interface UseDelayedStageBreakdownOptions {
  forceTab?: TabKey;
  stageFilter?: string;
}

interface StageHint {
  key: string;
  stageName: string;
  count: number;
  items: DelayedItem[];
  type: TabKey;
  /** 生成跳转到该环节的 URL（带具体 IDs，100% 精确筛选） */
  buildNavigateUrl: () => string;
}

/**
 * 延期环节数据 Hook — 只获取数据，不渲染 UI
 * 返回各环节的延期数量和精确跳转 URL（带具体 IDs，数据 100% 一致）
 *
 * ⚠️ 所有跳转统一走主列表页面（/production 或 /style-info），
 *    不走环节专属页面，因为后端判断延期是按订单当前环节，不是环节名本身，
 *    环节专属页面可能查不到这些订单。
 */
export const useDelayedStageBreakdown = (options: UseDelayedStageBreakdownOptions = {}) => {
  const { forceTab, stageFilter } = options;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DelayedStageBreakdownData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get('/dashboard/delayed-stage-breakdown');
      // api.get 返回 axios response，result.data = { code: 200, data: { bulkDelayed: [...], ... } }
      const raw = result?.data;
      const resp = raw?.data && typeof raw.data === 'object' ? raw.data : raw && typeof raw === 'object' ? raw : null;
      if (resp) {
        setData(resp as DelayedStageBreakdownData);
      }
    } catch (error) {
      console.error('Failed to load delayed stage breakdown:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 计算当前 tab 下的环节分组
  const stageHints: StageHint[] = (() => {
    if (!data) return [];
    const tab: TabKey = forceTab || 'bulk';
    let groups = tab === 'bulk' ? data.bulkDelayed : data.sampleDelayed;
    if (stageFilter) {
      groups = groups.filter(g => g.stageName === stageFilter);
    }
    return groups
      .filter(g => g.count > 0)
      .map(g => {
        // 生成跳转 URL，带具体 IDs，精确筛选
        // 统一走主列表页面（/production 或 /style-info）
        const buildNavigateUrl = () => {
          const basePath = tab === 'sample' ? '/style-info' : '/production';
          const ids = g.items.map(item => item.id);
          if (ids.length === 0) return basePath;
          const params = new URLSearchParams();
          if (tab === 'sample') {
            params.set('styleIds', ids.join(','));
          } else {
            params.set('orderIds', ids.join(','));
          }
          return `${basePath}?${params.toString()}`;
        };

        return {
          key: `delayed-${g.stageName}`,
          stageName: g.stageName,
          count: g.count,
          items: g.items,
          type: tab,
          buildNavigateUrl,
        };
      });
  })();

  const total = (() => {
    if (!data) return 0;
    const tab: TabKey = forceTab || 'bulk';
    if (stageFilter) {
      return stageHints.reduce((sum, h) => sum + h.count, 0);
    }
    return tab === 'bulk' ? data.bulkTotal : data.sampleTotal;
  })();

  return { stageHints, total, loading, data };
};

export type { TabKey, StageHint, DelayedItem, DelayedStageGroup };
