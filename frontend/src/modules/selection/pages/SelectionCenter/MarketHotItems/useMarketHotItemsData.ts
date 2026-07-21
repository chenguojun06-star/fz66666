import { useState, useEffect, useMemo, useCallback } from 'react';
import { App } from 'antd';
import {
  candidateSave,
  candidateStageAction,
  candidateCreateStyle,
  searchExternalMarket,
  fetchDailyHotItems,
  refreshDailyHotItems,
} from '@/services/selection/selectionApi';
import { computeMarketAnalysis, buildSourceOptions, SEARCH_HISTORY_STORAGE_KEY } from './helpers';
import type {
  DailyHotResponse,
  MarketAnalysis,
  SearchResult,
  ShoppingItem,
  SourceOption,
} from './types';

const readSearchHistory = (): SearchResult[] => {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readLastResult = (): SearchResult | null => {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[parsed.length - 1] : null;
  } catch {
    return null;
  }
};

export interface UseMarketHotItemsDataReturn {
  searchHistory: SearchResult[];
  result: SearchResult | null;
  loading: boolean;
  lastKeyword: string;
  addLoading: Record<number, boolean>;
  deployLoading: Record<number, boolean>;
  dailyHot: DailyHotResponse | null;
  dailyHotLoading: boolean;
  refreshing: boolean;
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  aiAnalysis: MarketAnalysis | null;
  sourceOptions: SourceOption[];
  filterProductsBySource: (items: ShoppingItem[]) => ShoppingItem[];
  loadDailyHot: () => Promise<void>;
  handleRefreshDailyHot: () => Promise<void>;
  handleClearSearchHistory: () => void;
  doSearch: (kw: string) => Promise<void>;
  handleAdd: (item: ShoppingItem, idx: number) => Promise<void>;
  handleDeploy: (item: ShoppingItem, idx: number) => Promise<void>;
}

export function useMarketHotItemsData(onAdded?: () => void): UseMarketHotItemsDataReturn {
  const { message } = App.useApp();
  const [searchHistory, setSearchHistory] = useState<SearchResult[]>(() => readSearchHistory());
  const [result, setResult] = useState<SearchResult | null>(() => readLastResult());
  const [loading, setLoading] = useState(false);
  const [lastKeyword, setLastKeyword] = useState('');
  const [addLoading, setAddLoading] = useState<Record<number, boolean>>({});
  const [deployLoading, setDeployLoading] = useState<Record<number, boolean>>({});
  const [dailyHot, setDailyHot] = useState<DailyHotResponse | null>(null);
  const [dailyHotLoading, setDailyHotLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
    } catch {
      // Ignore storage failures
    }
  }, [searchHistory]);

  const loadDailyHot = useCallback(async () => {
    setDailyHotLoading(true);
    try {
      const data = await fetchDailyHotItems() as DailyHotResponse;
      setDailyHot(data);
    } catch { /* 静默失败，不影响手动搜索 */ }
    finally { setDailyHotLoading(false); }
  }, []);

  const handleRefreshDailyHot = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await refreshDailyHotItems() as any;
      if (res?.started) {
        message.success('热榜刷新任务已启动，约1分钟后完成，请稍后再次点击刷新查看');
      } else {
        message.success(`热榜已更新：${res?.success ?? 0} 个关键词成功`);
        await loadDailyHot();
      }
    } catch { message.error('刷新失败，请稍后重试'); }
    finally { setRefreshing(false); }
  }, [loadDailyHot, message]);

  const handleClearSearchHistory = useCallback(() => {
    setResult(null);
    setLastKeyword('');
    setSearchHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  }, []);

  /* 搜索 */
  const doSearch = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) { message.warning('请输入搜索关键词'); return; }
    setLoading(true);
    setLastKeyword(trimmed);
    try {
      const data = await searchExternalMarket(trimmed, 20) as SearchResult;
      setResult(data);
      setSearchHistory(prev => {
        const next = prev.filter(item => item.keyword !== data.keyword);
        return [...next, data];
      });
      const hasUsableSearchData = Boolean(data.items?.length) || (typeof data.trendScore === 'number' && data.trendScore >= 0);
      if (data.serpApiEnabled === false && !hasUsableSearchData) {
        message.warning('SerpApi 未启用，请联系管理员配置 SERPAPI_KEY');
      } else if (!data.items?.length) {
        message.info('未搜索到相关商品，请换个关键词试试');
      }
    } catch {
      message.error('搜索失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }, [message]);

  const aiAnalysis = useMemo(() => {
    if (!result) return null;
    return computeMarketAnalysis({ items: result.items, trendScore: result.trendScore });
  }, [result]);

  /* 加入选品 */
  const handleAdd = useCallback(async (item: ShoppingItem, idx: number) => {
    setAddLoading(p => ({ ...p, [idx]: true }));
    try {
      await candidateSave({
        styleName: item.title?.slice(0, 80) || lastKeyword,
        category: lastKeyword,
        colorFamily: '',
        sourceType: 'EXTERNAL',
        sourceDesc: item.source || 'Google Shopping',
        referenceImages: item.thumbnail ? [item.thumbnail] : undefined,
        targetPrice: item.extractedPrice || undefined,
        remark: `来源：${item.source || 'Google Shopping'}｜${item.link || ''}`,
        seasonTags: lastKeyword,
      });
      message.success('已加入选品库');
      onAdded?.();
    } catch { message.error('添加失败'); }
    finally { setAddLoading(p => ({ ...p, [idx]: false })); }
  }, [lastKeyword, message, onAdded]);

  /* 一键下版 */
  const handleDeploy = useCallback(async (item: ShoppingItem, idx: number) => {
    setDeployLoading(p => ({ ...p, [idx]: true }));
    try {
      const res = await candidateSave({
        styleName: item.title?.slice(0, 80) || lastKeyword,
        category: lastKeyword,
        colorFamily: '',
        sourceType: 'EXTERNAL',
        sourceDesc: item.source || 'Google Shopping',
        referenceImages: item.thumbnail ? [item.thumbnail] : undefined,
        targetPrice: item.extractedPrice || undefined,
        remark: `来源：${item.source || 'Google Shopping'}`,
      }) as { id?: number };
      if (!res?.id) throw new Error('保存失败');
      await candidateStageAction(res.id, 'approve');
      await candidateCreateStyle(res.id);
      message.success('已一键下版！到「款式管理」查看');
      onAdded?.();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message ?? '下版失败');
    } finally { setDeployLoading(p => ({ ...p, [idx]: false })); }
  }, [lastKeyword, message, onAdded]);

  const sourceOptions = useMemo(() => {
    return buildSourceOptions(dailyHot?.sources, result?.sources);
  }, [dailyHot?.sources, result?.sources]);

  const filterProductsBySource = useCallback((items: ShoppingItem[]) => {
    const filtered = sourceFilter === 'ALL' ? items : items.filter(item => item.dataSource === sourceFilter);
    return [...filtered].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  }, [sourceFilter]);

  return {
    searchHistory,
    result,
    loading,
    lastKeyword,
    addLoading,
    deployLoading,
    dailyHot,
    dailyHotLoading,
    refreshing,
    sourceFilter,
    setSourceFilter,
    aiAnalysis,
    sourceOptions,
    filterProductsBySource,
    loadDailyHot,
    handleRefreshDailyHot,
    handleClearSearchHistory,
    doSearch,
    handleAdd,
    handleDeploy,
  };
}
