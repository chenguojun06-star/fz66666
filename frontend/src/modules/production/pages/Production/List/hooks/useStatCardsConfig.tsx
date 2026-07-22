import React from 'react';
import type { ProductionQueryParams } from '@/types/production';
import type { GlobalStats } from './useProductionStats';
import type { StatCard, HintItem } from '@/components/common/PageStatCards';

type StatFilterType = 'all' | 'production' | 'completed' | 'delayed' | 'today';

interface UseStatCardsConfigParams {
  globalStats: GlobalStats;
  activeStatFilter: string;
  setActiveStatFilter: (v: any) => void;
  setShowDelayedOnly: (v: boolean) => void;
  setQueryParams: any;
  queryParams: ProductionQueryParams;
  smartActionItems: any[];
  delayedHints: any[];
  focusOrderIds: Set<string>;
  setFocusOrderIds: (v: Set<string>) => void;
  setSmartQueueFilter: (v: string) => void;
  smartQueueFilter: string;
}

/**
 * 统计卡片配置 Hook
 * 从 ProductionList 主组件抽离：handleStatClick + cards + hints + extraRight
 * 仅做结构拆分，不修改业务逻辑
 */
export function useStatCardsConfig({
  globalStats,
  activeStatFilter: _activeStatFilter,
  setActiveStatFilter,
  setShowDelayedOnly,
  setQueryParams,
  queryParams,
  smartActionItems,
  delayedHints,
  focusOrderIds,
  setFocusOrderIds,
  setSmartQueueFilter,
  smartQueueFilter,
}: UseStatCardsConfigParams) {
  // 点击统计卡片筛选
  const handleStatClick = (type: StatFilterType) => {
    setActiveStatFilter(type);
    if (type === 'all') {
      // 全部：不排除终态，显示所有订单（含已完成/已关单）
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: undefined, excludeTerminal: undefined, page: 1 });
    } else if (type === 'production') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: undefined, excludeTerminal: true, page: 1 });
    } else if (type === 'completed') {
      // 已完成：只看终态订单
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: 'completed', delayedOnly: undefined, todayOnly: undefined, excludeTerminal: undefined, page: 1 });
    } else if (type === 'delayed') {
      setShowDelayedOnly(true);
      setQueryParams({ ...queryParams, status: '', delayedOnly: 'true', todayOnly: undefined, excludeTerminal: true, page: 1 });
    } else if (type === 'today') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: 'true', excludeTerminal: true, page: 1 });
    }
  };

  const cards: StatCard[] = [
    {
      key: 'all',
      items: [
        { label: '全部订单', value: Number(globalStats.totalOrders ?? 0), unit: '个', color: 'var(--color-text-primary)' },
        { label: '总数量', value: Number(globalStats.totalQuantity ?? 0), unit: '件', color: 'var(--color-text-primary)' },
      ],
      onClick: () => handleStatClick('all'),
      activeColor: 'var(--color-text-primary)',
    },
    {
      key: 'production',
      items: [
        { label: '生产中', value: Number(globalStats.activeOrders ?? globalStats.totalOrders ?? 0), unit: '个', color: 'var(--color-primary)' },
        { label: '数量', value: Number(globalStats.activeQuantity ?? globalStats.totalQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
      ],
      onClick: () => handleStatClick('production'),
      activeColor: 'var(--color-primary)',
    },
    {
      key: 'completed',
      items: [
        { label: '已完成', value: Number(globalStats.completedOrders ?? 0), unit: '个', color: 'var(--color-success)' },
        { label: '数量', value: Number(globalStats.completedQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
      ],
      onClick: () => handleStatClick('completed'),
      activeColor: 'var(--color-success)',
    },
    {
      key: 'delayed',
      items: [
        { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
        { label: '数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
      ],
      onClick: () => handleStatClick('delayed'),
      activeColor: 'var(--color-danger)',
    },
    {
      key: 'today',
      items: [
        { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
        { label: '数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
      ],
      onClick: () => handleStatClick('today'),
      activeColor: 'var(--color-primary)',
    },
  ];

  const hints: HintItem[] = [
    ...smartActionItems.map((item) => ({ ...item, count: item.value })),
    ...delayedHints.map(h => ({
      key: h.key,
      count: h.count,
      tone: 'red' as const,
      label: `${h.stageName}延期`,
      hint: `点击查看${h.stageName}延期订单`,
      active: focusOrderIds.size > 0 && h.items.some((item: any) => focusOrderIds.has(String(item.id))),
      onClick: () => {
        // 已在当前页面，直接设置筛选，不走 navigate
        const ids = h.items.map((item: any) => String(item.id));
        setFocusOrderIds(new Set(ids));
        setSmartQueueFilter('all');
        setQueryParams((prev: ProductionQueryParams) => ({ ...prev, page: 1 }));
      },
    })),
  ];

  const onClearHints: (() => void) | undefined =
    smartQueueFilter !== 'all' || focusOrderIds.size > 0
      ? () => { setSmartQueueFilter('all'); setFocusOrderIds(new Set()); }
      : undefined;

  const extraRight: React.ReactNode = (
    <button
      type="button"
      onClick={() => setQueryParams((prev: ProductionQueryParams) => ({
        ...prev,
        page: 1,
        status: undefined,
        excludeTerminal: !prev.excludeTerminal,
        includeScrapped: prev.excludeTerminal ? true : false,
      }))}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        border: '1px solid var(--color-border-antd)',
        background: 'var(--color-bg-base)',
        color: !queryParams.excludeTerminal ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {queryParams.excludeTerminal ? '显示全部' : '只看进行中'}
    </button>
  );

  return { cards, hints, onClearHints, extraRight };
}
