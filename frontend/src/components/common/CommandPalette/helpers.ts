import { menuConfig } from '@/routeConfig';
import type { MenuEntry } from './types';

export const STATUS_COLOR: Record<string, string> = {
  pending:    '#8b5cf6',
  production: '#0ea5e9',
  completed:  '#22c55e',
  delayed:    '#f59e0b',
  scrapped:   'var(--color-text-secondary)',
  cancelled:  'var(--color-text-secondary)',
  canceled:   'var(--color-text-secondary)',
  paused:     '#f59e0b',
  returned:   'var(--color-warning)',
};

export const STATUS_LABEL_ZH: Record<string, string> = {
  pending:    '待生产',
  production: '生产中',
  completed:  '已完成',
  delayed:    '已逾期',
  scrapped:   '已报废',
  cancelled:  '已取消',
  canceled:   '已取消',
  paused:     '已暂停',
  returned:   '已退回',
};

export function buildMenuIndex(): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const section of menuConfig) {
    if (section.items) {
      for (const item of section.items) {
        entries.push({
          label: item.label,
          path: item.path,
          section: section.title,
          icon: item.icon,
          keywords: [item.label, section.title, item.path].filter(Boolean),
        });
      }
    } else if (section.path) {
      entries.push({
        label: section.title,
        path: section.path,
        section: section.title,
        icon: section.icon,
        keywords: [section.title, section.path].filter(Boolean),
      });
    }
  }
  return entries;
}

export const MENU_INDEX = buildMenuIndex();
