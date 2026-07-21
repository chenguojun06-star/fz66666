import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import type { SmartFilterType } from '../helpers';

/**
 * 智能筛选 Hook
 * 从 index.tsx 抽离：已延期/临近交期款式过滤 + smartFilter 状态 + 定位滚动
 */
export function useSmartFilter(styles: StyleInfo[]) {
  const [smartFilter, setSmartFilter] = useState<SmartFilterType>('all');

  // 已延期款式（基于交板日期 deliveryDate）
  const overdueStyles = useMemo(() => {
    return styles.filter((s) => {
      if (!s.deliveryDate) return false;
      return dayjs(s.deliveryDate).endOf('day').isBefore(dayjs());
    });
  }, [styles]);

  // 临近交期款式（3 天内）
  const warningStyles = useMemo(() => {
    return styles.filter((s) => {
      if (!s.deliveryDate) return false;
      const d = dayjs(s.deliveryDate).endOf('day');
      return d.isAfter(dayjs()) && d.isBefore(dayjs().add(3, 'day'));
    });
  }, [styles]);

  const displayStyles = useMemo(() => {
    if (smartFilter === 'overdue') return overdueStyles;
    if (smartFilter === 'warning') return warningStyles;
    return styles;
  }, [smartFilter, styles, overdueStyles, warningStyles]);

  const handleSmartFilterClick = (
    target: 'overdue' | 'warning',
    records: StyleInfo[],
  ) => {
    if (smartFilter === target) {
      setSmartFilter('all');
      return;
    }
    setSmartFilter(target);
    // 滚动到第一个匹配项
    const firstMatch = records[0];
    if (firstMatch?.id) {
      setTimeout(() => {
        const node = document.querySelector(`#style-row-${firstMatch.id}`) as HTMLElement | null;
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  const handleClearSmartFilter = () => {
    setSmartFilter('all');
  };

  return {
    smartFilter,
    setSmartFilter,
    overdueStyles,
    warningStyles,
    displayStyles,
    handleSmartFilterClick,
    handleClearSmartFilter,
  };
}
