import { useMemo, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { menuConfig } from '../../routeConfig';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { type AppLanguage } from '../../i18n/languagePreference';
import { t } from '../../i18n';
import { normalizePath } from './useLayoutAuth';

type RecentPage = {
  path: string;
  basePath: string;
  title: string;
  ts: number;
};

const recentPagesStorageKey = 'layout.header.recentPages';
const maxRecentPages = 12;

function readRecentPages(language: string): RecentPage[] {
  try {
    const raw = localStorage.getItem(recentPagesStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed
      .filter((x) => x && typeof x.path === 'string' && typeof x.title === 'string')
      .map((x) => ({
        path: String(x.path),
        basePath: typeof x.basePath === 'string' ? x.basePath : String(x.path).split('?')[0],
        title: (typeof x.basePath === 'string' ? x.basePath : String(x.path).split('?')[0]) === '/production/warehousing'
          ? '质检入库'
          : String(x.title),
        ts: typeof x.ts === 'number' ? x.ts : Date.now(),
      }));

    const seen = new Set<string>();
    const deduped: RecentPage[] = [];
    for (const p of list) {
      const k = String(p.basePath || '').trim() || String(p.path || '').split('?')[0];
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(p);
    }
    return deduped;
  } catch {
    return [];
  }
}

function writeRecentPages(pages: RecentPage[]) {
  try {
    localStorage.setItem(recentPagesStorageKey, JSON.stringify(pages));
  } catch {
    // intentionally empty
  }
}

function resolveRecentTitle(basePath: string | undefined, pathname: string, language: AppLanguage, localizedMenuConfig: any[]): string {
  const base = basePath || pathname;
  if (base === '/style-info' && pathname !== base) return t('layout.styleInfoDetail', language);
  if (base === '/production/cutting' && pathname.startsWith('/production/cutting/task/')) return t('layout.cuttingTask', language);
  if (base === '/production/warehousing' && pathname.startsWith('/production/warehousing/detail/')) return t('layout.warehousingDetail', language);
  if (base === '/cockpit') return '数据看板';
  if (base === '/cockpit/agent-traces') return 'AI执行记录中心';
  if (base === '/intelligence/center') return '智能运营中心';
  if (base === '/intelligence/agent-traces') return 'AI执行记录中心';

  for (const section of localizedMenuConfig) {
    if (section.path && normalizePath(section.path) === base) return section.title;
    if (section.items?.length) {
      for (const item of section.items) {
        if (normalizePath(item.path) === base) return item.label;
      }
    }
  }
  return base;
}

export function useActivePath(effectivePathname: string) {
  return useMemo(() => {
    const current = normalizePath(effectivePathname);
    const allPaths: string[] = [];
    for (const section of menuConfig) {
      if (section.items?.length) {
        for (const item of section.items) allPaths.push(normalizePath(item.path));
      } else if (section.path) {
        allPaths.push(normalizePath(section.path));
      }
    }

    let best: string | undefined;
    for (const p of allPaths) {
      if (current === p) {
        if (!best || p.length > best.length) best = p;
        continue;
      }
      if (current.startsWith(p + '/')) {
        if (!best || p.length > best.length) best = p;
      }
    }
    return best;
  }, [effectivePathname]);
}

export function useActiveSectionKey(getActivePath: string | undefined) {
  return useMemo(() => {
    if (!getActivePath) return null;
    for (const section of menuConfig) {
      if (section.items?.some((it) => normalizePath(it.path) === getActivePath)) return section.key;
      if (section.path && normalizePath(section.path) === getActivePath) return section.key;
    }
    return null;
  }, [getActivePath]);
}

export interface RecentPagesResult {
  recentPages: RecentPage[];
  recentsContainerRef: React.RefObject<HTMLDivElement>;
  activeTabRef: React.RefObject<HTMLDivElement>;
  closeRecent: (path: string) => void;
}

export function useRecentPages(
  effectivePathname: string,
  effectiveSearch: string,
  effectiveFullPath: string,
  getActivePath: string | undefined,
  language: AppLanguage,
  localizedMenuConfig: any[],
): RecentPagesResult {
  const navigate = useNavigate();
  const [recentPages, setRecentPages] = useState<RecentPage[]>(() => {
    if (typeof window === 'undefined') return [];
    return readRecentPages(language).slice(0, maxRecentPages);
  });
  const recentsContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!effectivePathname) return;
    if (normalizePath(effectivePathname) === '/login') return;

    const basePath = getActivePath || normalizePath(effectivePathname);
    let title = resolveRecentTitle(basePath, normalizePath(effectivePathname), language, localizedMenuConfig);
    if (normalizePath(effectivePathname) === '/system/factory-workers') {
      const sp = new URLSearchParams(effectiveSearch || '');
      const factoryName = sp.get('factoryName');
      title = factoryName ? `${factoryName} - 工人名册` : '工人名册';
    }
    const nextItem: RecentPage = {
      path: effectiveFullPath,
      basePath,
      title,
      ts: Date.now(),
    };

    setRecentPages((prev) => {
      const filtered = prev.filter((p) => p.basePath !== nextItem.basePath);
      const next = [nextItem, ...filtered].slice(0, maxRecentPages);
      writeRecentPages(next);
      return next;
    });
  }, [effectiveFullPath, effectivePathname, getActivePath]);

  useEffect(() => {
    if (!activeTabRef.current || !recentsContainerRef.current) return;
    requestAnimationFrame(() => {
      if (!activeTabRef.current || !recentsContainerRef.current) return;
      const container = recentsContainerRef.current;
      const activeTab = activeTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const tabLeft = tabRect.left - containerRect.left + container.scrollLeft;
      const tabRight = tabLeft + tabRect.width;
      if (tabLeft < container.scrollLeft) {
        container.scrollLeft = tabLeft - 10;
      } else if (tabRight > container.scrollLeft + containerRect.width) {
        container.scrollLeft = tabRight - containerRect.width + 10;
      }
    });
  }, [effectiveFullPath]);

  const closeRecent = (path: string) => {
    setRecentPages((prev) => {
      const idx = prev.findIndex((p) => p.path === path);
      const next = prev.filter((p) => p.path !== path);
      writeRecentPages(next);
      if (path === effectiveFullPath) {
        const fallback = next[idx] || next[idx - 1] || { path: '/dashboard' };
        if (fallback.path && fallback.path !== effectiveFullPath) navigate(fallback.path);
      }
      return next;
    });
  };

  return { recentPages, recentsContainerRef, activeTabRef, closeRecent };
}

export { readRecentPages, writeRecentPages, resolveRecentTitle, recentPagesStorageKey, maxRecentPages };
export type { RecentPage };
