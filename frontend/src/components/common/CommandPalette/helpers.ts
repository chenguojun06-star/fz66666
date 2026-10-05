import { menuConfig } from '@/routeConfig';
import type { MenuEntry } from './types';

export const STATUS_COLOR: Record<string, string> = {
  pending:    'var(--color-violet-500)',
  production: 'var(--color-sky-500)',
  completed:  'var(--color-success)',
  delayed:    'var(--color-warning)',
  scrapped:   'var(--color-text-secondary)',
  cancelled:  'var(--color-text-secondary)',
  canceled:   'var(--color-text-secondary)',
  paused:     'var(--color-warning)',
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

/**
 * 构建菜单索引。
 *
 * D-748：`includeSuperAdminOnly=false` 时剔除超管专属菜单项 ——
 * 否则非超管在命令面板里搜得到、点进去却被 PrivateRoute 弹回首页，体验割裂。
 */
export function buildMenuIndex(includeSuperAdminOnly = true): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const section of menuConfig) {
    if (section.superAdminOnly && !includeSuperAdminOnly) continue;
    if (section.items) {
      for (const item of section.items) {
        if (item.superAdminOnly && !includeSuperAdminOnly) continue;
        entries.push({
          label: item.label,
          path: item.path,
          section: section.title,
          icon: item.icon,
          keywords: [item.label, section.title, item.path].filter(Boolean),
          superAdminOnly: item.superAdminOnly,
        });
      }
    } else if (section.path) {
      entries.push({
        label: section.title,
        path: section.path,
        section: section.title,
        icon: section.icon,
        keywords: [section.title, section.path].filter(Boolean),
        superAdminOnly: section.superAdminOnly,
      });
    }
  }
  return entries;
}

/** 全量菜单索引（含超管专属项）；按用户权限过滤请用 buildMenuIndex(isSuperAdmin) */
export const MENU_INDEX = buildMenuIndex(true);
