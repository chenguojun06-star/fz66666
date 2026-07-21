import type { StatCard, HintItem } from '@/components/common/PageStatCards';
import type { StyleInfo } from '@/types/style';
import type { OrderStats, StatFilterType, SmartFilterType } from '../helpers';

interface UseStatCardsConfigParams {
  orderStats: OrderStats;
  activeStatFilter: StatFilterType;
  setActiveStatFilter: (v: StatFilterType) => void;
  setQueryParams: any;
  setSmartFilter: (v: SmartFilterType) => void;
  smartFilter: SmartFilterType;
  overdueStyles: StyleInfo[];
  warningStyles: StyleInfo[];
  handleSmartFilterClick: (target: 'overdue' | 'warning', records: StyleInfo[]) => void;
  handleClearSmartFilter: () => void;
}

/**
 * 统计卡片配置 Hook
 * 从 index.tsx 抽离：PageStatCards 的 cards / hints / onClearHints 配置
 * 仅做结构拆分，不修改业务逻辑
 */
export function useStatCardsConfig({
  orderStats,
  activeStatFilter,
  setActiveStatFilter,
  setQueryParams,
  setSmartFilter,
  smartFilter,
  overdueStyles,
  warningStyles,
  handleSmartFilterClick,
  handleClearSmartFilter,
}: UseStatCardsConfigParams) {
  const cards: StatCard[] = [
    {
      key: 'all',
      items: [
        { label: '全部订单', value: orderStats.totalStyles, unit: '个', color: 'var(--color-text-primary)' },
      ],
      onClick: () => {
        setActiveStatFilter('all');
        setQueryParams((prev: any) => ({ ...prev, onlyCompleted: false, onlyInProgress: false, page: 1 }));
        setSmartFilter('all');
      },
      activeColor: 'var(--color-text-primary)',
    },
    {
      key: 'inProgress',
      items: [
        { label: '下单中', value: orderStats.developingStyles, unit: '个', color: 'var(--color-primary)' },
      ],
      onClick: () => {
        setActiveStatFilter('inProgress');
        setQueryParams((prev: any) => ({ ...prev, onlyCompleted: false, onlyInProgress: true, page: 1 }));
        setSmartFilter('all');
      },
      activeColor: 'var(--color-primary)',
    },
    {
      key: 'completed',
      items: [
        { label: '已完成', value: orderStats.completedStyles, unit: '个', color: 'var(--color-success)' },
      ],
      onClick: () => {
        setActiveStatFilter('completed');
        setQueryParams((prev: any) => ({ ...prev, onlyCompleted: true, onlyInProgress: false, page: 1 }));
        setSmartFilter('all');
      },
      activeColor: 'var(--color-success)',
    },
    {
      key: 'delayed',
      items: [
        { label: '已延期', value: orderStats.delayedStyles, unit: '个', color: 'var(--color-danger)' },
      ],
      onClick: () => {
        setActiveStatFilter('delayed');
        setQueryParams((prev: any) => ({ ...prev, onlyCompleted: false, onlyInProgress: false, page: 1 }));
        handleSmartFilterClick('overdue', overdueStyles);
      },
      activeColor: 'var(--color-danger)',
    },
  ];

  const hints: HintItem[] = [
    {
      key: 'overdue',
      count: overdueStyles.length,
      tone: 'red',
      label: '已延期',
      hint: overdueStyles[0]?.styleNo ? `点击定位到 ${overdueStyles[0].styleNo}` : '点击定位到延期款号',
      active: smartFilter === 'overdue',
      onClick: () => handleSmartFilterClick('overdue', overdueStyles),
    },
    {
      key: 'warning',
      count: warningStyles.length,
      tone: 'orange',
      label: '临近交期',
      hint: warningStyles[0]?.styleNo ? `点击定位到 ${warningStyles[0].styleNo}` : '点击定位到临近交期款号',
      active: smartFilter === 'warning',
      onClick: () => handleSmartFilterClick('warning', warningStyles),
    },
  ];

  const onClearHints = smartFilter !== 'all' ? handleClearSmartFilter : undefined;

  return { cards, hints, onClearHints, activeStatFilter };
}
