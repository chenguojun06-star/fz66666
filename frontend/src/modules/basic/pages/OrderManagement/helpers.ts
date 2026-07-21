/**
 * OrderManagement 纯函数 / 类型 / 常量
 * 从 index.tsx 抽离，不含 React 逻辑
 */

export type StatFilterType = 'all' | 'inProgress' | 'completed' | 'delayed';
export type SmartFilterType = 'all' | 'overdue' | 'warning';

export interface OrderStats {
  totalStyles: number;
  developingStyles: number;
  completedStyles: number;
  delayedStyles: number;
}

export const initialOrderStats: OrderStats = {
  totalStyles: 0,
  developingStyles: 0,
  completedStyles: 0,
  delayedStyles: 0,
};

/** 构建 tooltip 主题色（暗色/亮色自适应） */
export const buildTooltipTheme = () => {
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : '';
  const isDark = theme === 'dark';
  return {
    background: isDark ? 'var(--color-bg-base)' : '#111827',
    text: isDark ? '#1f1f1f' : 'var(--color-bg-page)',
    border: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)',
    divider: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)',
  };
};
