import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { STYLE_INFO_LIST_REFRESH_KEY } from '@/modules/warehouse/pages/SampleInventory';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { StatsRangeType } from '../../StyleInfo/hooks/useStyleStats';
import dayjs from 'dayjs';
import { isScrappedStyle } from '../components/styleTableViewUtils';

export type StyleSmartFilter = 'all' | 'overdue' | 'warning';

interface UseStyleListDataParams {
  data: StyleInfo[];
  total: number;
  queryParams: StyleQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<StyleQueryParams>>;
  fetchList: (params?: StyleQueryParams) => Promise<void>;
  statsRangeType: StatsRangeType;
  loadDevelopmentStats: (rangeType: StatsRangeType, dateRange?: { startDate: string; endDate: string }) => Promise<void>;
}

/**
 * 款式列表数据 Hook
 * 整合数据加载、状态管理、派生数据计算
 */
export const useStyleListData = ({
  data,
  total,
  queryParams,
  setQueryParams,
  fetchList,
  statsRangeType,
  loadDevelopmentStats,
}: UseStyleListDataParams) => {
  const location = useLocation();

  // 字典选项（品类，用于表格展示代码转标签）
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [stockStateMap, setStockStateMap] = useState<Record<string, boolean>>({});
  const [smartFilter, setSmartFilter] = useState<StyleSmartFilter>('all');
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [dateSortAsc, setDateSortAsc] = useState(false);

  // 延期环节跳转带来的精确款式 ID 筛选（来自 /dashboard/delayed-stage-breakdown）
  const [focusStyleIds, setFocusStyleIds] = useState<Set<string>>(new Set());

  // 顶部统计卡片数据（总数/开发中/已完成/已延期）
  const [styleStats, setStyleStats] = useState<{ totalStyles: number; developingStyles: number; completedStyles: number; delayedStyles: number }>({ totalStyles: 0, developingStyles: 0, completedStyles: 0, delayedStyles: 0 });
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'developing' | 'completed' | 'delayed'>('developing');

  // 从 URL 读取 styleIds 参数（延期环节跳转携带）
  // ⚠️ 必须监听 location.search 变化，否则同页面 navigate 只改 URL 不触发重渲染
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleIdsParam = (params.get('styleIds') || '').trim();
    if (styleIdsParam) {
      const ids = styleIdsParam.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 0) setFocusStyleIds(new Set(ids));
    } else {
      setFocusStyleIds(new Set());
    }
  }, [location.search]);

  // 顶部统计卡片数据加载
  const loadStyleStats = useCallback(async () => {
    try {
      const res: any = await api.get('/style/info/stats');
      if (res.code === 200 && res.data) {
        setStyleStats({
          totalStyles: Number(res.data.totalStyles || 0),
          developingStyles: Number(res.data.developingStyles || 0),
          completedStyles: Number(res.data.completedStyles || 0),
          delayedStyles: Number(res.data.delayedStyles || 0),
        });
      }
    } catch {
      // 静默失败，不影响列表加载
    }
  }, []);

  // 加载品类选项（从字典API动态加载，用于表格代码转标签）
  const loadCategoryOptions = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { records?: { dictCode: string; dictLabel: string }[] } }>(
        '/system/dict/list', { params: { dictType: 'category', page: 1, pageSize: 100 } }
      );
      if (res.code === 200) {
        const records = (res.data as any)?.records || [];
        if (records.length) {
          setCategoryOptions(records.map((r: any) => ({ label: r.dictLabel, value: r.dictCode })));
          return;
        }
      }
    } catch (_) { /* 静默失败 */ }
    // 默认备用
    setCategoryOptions([
      { label: '女装', value: 'WOMAN' }, { label: '男装', value: 'MAN' },
      { label: '童装', value: 'KIDS' }, { label: '女童装', value: 'WCMAN' },
      { label: '男女同款', value: 'UNISEX' },
    ]);
  }, []);

  // 初始化加载
  useEffect(() => {
    fetchList();
    loadDevelopmentStats(statsRangeType);
    loadCategoryOptions();
    loadStyleStats();
  }, [fetchList, loadDevelopmentStats, statsRangeType]);

  // queryParams 变化时重新加载
  useEffect(() => {
    fetchList();
  }, [fetchList, queryParams.page, queryParams.pageSize, queryParams.styleNo, queryParams.styleName, queryParams.progressNode]);

  // 监听刷新信号 + 进度变更事件
  useEffect(() => {
    const refreshIfNeeded = () => {
      if (!localStorage.getItem(STYLE_INFO_LIST_REFRESH_KEY)) return;
      localStorage.removeItem(STYLE_INFO_LIST_REFRESH_KEY);
      fetchList();
      loadDevelopmentStats(statsRangeType);
    };

    refreshIfNeeded();
    const handleFocus = () => refreshIfNeeded();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshIfNeeded();
    };

    // 监听订单进度变更事件，实时刷新款式列表（500ms 防抖）
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleProgressChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchList();
        loadDevelopmentStats(statsRangeType);
      }, 500);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('order:progress:changed', handleProgressChange);
    window.addEventListener('data:changed', handleProgressChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('order:progress:changed', handleProgressChange);
      window.removeEventListener('data:changed', handleProgressChange);
    };
  }, [fetchList, loadDevelopmentStats, statsRangeType]);

  // 90s 轮询兜底（页面可见时才轮询，避免后台浪费资源）
  useSync(
    'style-info-list-poll',
    async () => {
      await fetchList();
      return null;
    },
    () => {},
    { interval: 90000, pauseOnHidden: true }
  );

  const stockStateLoadedRef = useRef('');

  useEffect(() => {
    const styleNos = Array.from(new Set(
      data
        .map((item) => String(item.styleNo || '').trim())
        .filter(Boolean)
    ));
    if (!styleNos.length) {
      setStockStateMap({});
      return;
    }

    const loadKey = styleNos.sort().join(',');
    if (stockStateLoadedRef.current === loadKey) return;
    stockStateLoadedRef.current = loadKey;

    let cancelled = false;

    const loadStockState = async () => {
      try {
        const BATCH_SIZE = 5;
        const nextMap: Record<string, boolean> = {};

        for (let i = 0; i < styleNos.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const batch = styleNos.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(async (styleNo) => {
            const res = await api.get('/stock/sample/list', {
              params: {
                page: 1,
                pageSize: 50,
                styleNo,
                sampleType: 'development',
                recordStatus: 'active',
              },
            });
            return { styleNo, records: res?.data?.records || [] };
          }));

          for (const { styleNo, records } of results) {
            for (const item of records) {
              const key = `${String(styleNo || '').trim().toUpperCase()}|${String(item?.color || '').trim().toUpperCase()}`;
              if (key !== '|') {
                nextMap[key] = true;
              }
            }
          }
        }

        if (!cancelled) setStockStateMap(nextMap);
      } catch {
        if (!cancelled) setStockStateMap({});
      }
    };

    void loadStockState();
    return () => { cancelled = true; };
  }, [data]);

  const activeStyles = useMemo(() => {
    return data.filter((item) => {
      const status = String(item.status || '').trim().toLowerCase();
      if (status === 'archived' || status === 'scrapped') return false;
      const progressNode = String(item.progressNode || '').trim();
      const sampleStatus = String(item.sampleStatus || '').trim().toUpperCase();
      // 样衣完成唯一判定：sampleStatus=COMPLETED（后端 completeSample 前置校验通过后才会设置）
      // 审核通过（PASS/APPROVED）不算完成，因为还需要入库环节
      // PRODUCTION_COMPLETED 也不算完成，只是样板制作完成
      if (progressNode === '样衣完成' || progressNode === '开发样报废') return false;
      if (sampleStatus === 'COMPLETED') return false;
      return true;
    });
  }, [data]);

  const overdueStyles = useMemo(() => {
    return activeStyles.filter((item) => {
      if (!item.deliveryDate) return false;
      return dayjs(item.deliveryDate).endOf('day').isBefore(dayjs());
    });
  }, [activeStyles]);

  const warningStyles = useMemo(() => {
    return activeStyles.filter((item) => {
      if (!item.deliveryDate) return false;
      const diffDays = dayjs(item.deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
      return diffDays >= 0 && diffDays <= 3;
    });
  }, [activeStyles]);

  const overdueStyleCount = useMemo(() => {
    return overdueStyles.length;
  }, [overdueStyles]);

  const warningStyleCount = useMemo(() => {
    return warningStyles.length;
  }, [warningStyles]);

  const displayData = useMemo(() => {
    let base = smartFilter === 'overdue' ? overdueStyles
             : smartFilter === 'warning' ? warningStyles
             : showAllStyles ? data
             : activeStyles;
    if (focusStyleIds.size > 0) {
      base = base.filter(s => focusStyleIds.has(String(s.id)));
    }
    if (base.length > 1) {
      base = [...base].sort((a, b) => {
        const aScrapped = isScrappedStyle(a) ? 1 : 0;
        const bScrapped = isScrappedStyle(b) ? 1 : 0;
        if (aScrapped !== bScrapped) return aScrapped - bScrapped;
        const aTime = new Date((a.updateTime || a.createTime || 0) as string | number).getTime();
        const bTime = new Date((b.updateTime || b.createTime || 0) as string | number).getTime();
        return dateSortAsc ? aTime - bTime : bTime - aTime;
      });
    }
    return base;
  }, [smartFilter, data, activeStyles, overdueStyles, warningStyles, dateSortAsc, focusStyleIds, showAllStyles]);

  const displayTotal = smartFilter !== 'all' || !showAllStyles ? displayData.length : total;

  return {
    // 状态
    categoryOptions,
    stockStateMap,
    smartFilter,
    setSmartFilter,
    showAllStyles,
    setShowAllStyles,
    dateSortAsc,
    setDateSortAsc,
    focusStyleIds,
    setFocusStyleIds,
    styleStats,
    activeStatFilter,
    setActiveStatFilter,
    // 派生数据
    activeStyles,
    overdueStyles,
    warningStyles,
    overdueStyleCount,
    warningStyleCount,
    displayData,
    displayTotal,
    // 加载函数
    loadStyleStats,
    loadCategoryOptions,
  };
};
