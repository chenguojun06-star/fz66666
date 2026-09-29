import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { menuConfig } from '../../routeConfig';
import { type AppLanguage } from '../../i18n/languagePreference';
import { t } from '../../i18n';
import { normalizePath } from './useLayoutAuth';
import { useUserPreference } from '@/hooks/useUserPreference';
import { PLATFORM_LIST } from '../../modules/integration/pages/IntegrationCenter/PlatformConnectorConstants';

type RecentPage = {
  path: string;
  basePath: string;
  title: string;
  ts: number;
  /** 页签被用户图钉固定（常驻页签栏最前，跨登录跟随账号） */
  pinned?: boolean;
};

/** 图钉固定的页签（按 basePath 记，与最近打开分开持久化） */
type PinnedTab = { basePath: string; title: string; ts: number };

const recentPagesStorageKey = 'layout.header.recentPages';
const pinnedTabsStorageBase = 'layout.header.pinnedPages';
const maxRecentPages = 12;
const maxPinnedTabs = 12;

const pinnedTabsStorageKeyOf = (userKey: string) => `${pinnedTabsStorageBase}.${userKey || 'anon'}`;

function readPinnedTabs(userKey: string): PinnedTab[] {
  try {
    const raw = localStorage.getItem(pinnedTabsStorageKeyOf(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.basePath === 'string')
      .map((x) => ({
        basePath: String(x.basePath),
        title: typeof x.title === 'string' ? x.title : String(x.basePath),
        ts: typeof x.ts === 'number' ? x.ts : Date.now(),
      }))
      .slice(0, maxPinnedTabs);
  } catch {
    return [];
  }
}

function writePinnedTabs(userKey: string, pins: PinnedTab[]) {
  try {
    localStorage.setItem(pinnedTabsStorageKeyOf(userKey), JSON.stringify(pins));
  } catch {
    // intentionally empty
  }
}

function readRecentPages(_language: string): RecentPage[] {
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
  if (base === '/intelligence/patrol') return '巡检工单中心';
  if (base === '/intelligence/agent-traces') return 'AI执行记录中心';
  if (base === '/ecommerce/center') return '平台总览';
  if (base === '/ecommerce/platform' || pathname.startsWith('/ecommerce/platform/')) {
    const code = pathname.split('/')[3];
    const platform = PLATFORM_LIST.find((p) => p.code === code);
    return platform ? `${platform.name} - 平台详情` : '平台详情';
  }
  if (base === '/warehouse/ecommerce') return '电商订单';
  if (base === '/finance/ec-revenue') return 'EC销售收入';
  if (base === '/crm') return '客户档案';
  if (base === '/crm/receivables') return '应收账款';
  if (base === '/finance/receivables') return '应收账款';
  if (base === '/finance/payable') return '应付账款';
  if (base === '/finance/payment-schedule') return '付款计划';
  if (base === '/finance/employee-advance') return '员工借支';
  if (base === '/finance/tax-export') return '财税导出';
  if (base === '/finance/dashboard') return '财务总览';
  if (base === '/warehouse/product-info') return '商品资料';
  if (base === '/warehouse/label-print') return '标签打印';
  if (base === '/warehouse/inventory-check') return '库存盘点';
  if (base === '/production/picking') return '物料领料';
  if (base === '/production/transfer') return '订单转移';
  if (base === '/production/order-flow') return '订单流程';
  if (base === '/basic/maintenance-center') return '资料单价';
  if (base === '/order-management') return '商品下单';
  if (base === '/system/organization') return '组织架构';
  if (base === '/system/partner-management') return '合作企业管理';
  if (base === '/system/orphan-data') return '孤立数据';
  if (base === '/system/app-store') return '应用商店';
  if (base === '/system/customer') return '客户管理';
  if (base === '/system/tenant') return 'API对接管理';
  if (base === '/basic/template-center') return '模板中心';
  if (base === '/basic/pattern-revision') return '纸样修改';
  if (base === '/data-center') return '数据中心';

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

    if (!best) {
      const prefix = '/' + current.split('/').slice(1, 3).join('/');
      for (const p of allPaths) {
        if (p.startsWith(prefix) && p.length > prefix.length) {
          if (!best || p.length > (best?.length ?? 0)) best = p;
        }
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
  /** 切换图钉固定状态（pinned=true 取消固定，false 固定到最前） */
  togglePin: (basePath: string, title?: string) => void;
}

export function useRecentPages(
  effectivePathname: string,
  effectiveSearch: string,
  effectiveFullPath: string,
  getActivePath: string | undefined,
  language: AppLanguage,
  localizedMenuConfig: any[],
  userKey: string,
): RecentPagesResult {
  const navigate = useNavigate();
  const { listByPage, save: savePreference } = useUserPreference();
  const [recentPages, setRecentPages] = useState<RecentPage[]>(() => {
    if (typeof window === 'undefined') return [];
    return readRecentPages(language).slice(0, maxRecentPages);
  });
  const [pinnedTabs, setPinnedTabs] = useState<PinnedTab[]>(() => readPinnedTabs(userKey));
  const recentsContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // 图钉固定持久化：本地即时读 + 偏好云覆盖（换浏览器/重装后登录仍跟人走）
  useEffect(() => {
    setPinnedTabs(readPinnedTabs(userKey));
  }, [userKey]);

  useEffect(() => {
    if (!userKey) return;
    let cancelled = false;
    void (async () => {
      const items = await listByPage('layout-tabs');
      if (cancelled) return;
      const pref = items.find((it) => it.preferenceType === 'pinnedPages');
      if (pref?.preferenceValue) {
        try {
          const parsed = JSON.parse(pref.preferenceValue);
          if (Array.isArray(parsed) && parsed.length) {
            const cloud = parsed
              .filter((x: any) => x && typeof x.basePath === 'string')
              .map((x: any) => ({
                basePath: String(x.basePath),
                title: typeof x.title === 'string' ? x.title : String(x.basePath),
                ts: typeof x.ts === 'number' ? x.ts : Date.now(),
              }))
              .slice(0, maxPinnedTabs);
            setPinnedTabs(cloud);
            writePinnedTabs(userKey, cloud);
          }
        } catch { /* 云端值损坏时保持本地 */ }
      }
    })();
    return () => { cancelled = true; };
  }, [userKey, listByPage]);

  const persistPinnedTabs = useCallback((next: PinnedTab[]) => {
    if (!userKey) return;
    writePinnedTabs(userKey, next);
    void savePreference({ pageKey: 'layout-tabs', preferenceType: 'pinnedPages', preferenceValue: next });
  }, [userKey, savePreference]);

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
  }, [effectiveFullPath, effectivePathname, effectiveSearch, language, localizedMenuConfig, getActivePath]);

  useEffect(() => {
    if (!activeTabRef.current || !recentsContainerRef.current) return;
    requestAnimationFrame(() => {
      if (!activeTabRef.current || !recentsContainerRef.current) return;
      const container = recentsContainerRef.current;
      const activeTab = activeTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const currentScrollLeft = container.scrollLeft;
      const containerWidth = containerRect.width;
      const tabLeft = tabRect.left - containerRect.left + currentScrollLeft;
      const tabRight = tabLeft + tabRect.width;
      let targetScrollLeft = currentScrollLeft;
      if (tabLeft < currentScrollLeft) {
        targetScrollLeft = tabLeft - 10;
      } else if (tabRight > currentScrollLeft + containerWidth) {
        targetScrollLeft = tabRight - containerWidth + 10;
      }
      if (targetScrollLeft !== currentScrollLeft) {
        requestAnimationFrame(() => {
          container.scrollLeft = targetScrollLeft;
        });
      }
    });
  }, [effectiveFullPath]);

  const closeRecent = (path: string) => {
    setRecentPages((prev) => {
      const idx = prev.findIndex((p) => p.path === path);
      const target = prev[idx];
      const next = prev.filter((p) => p.path !== path);
      writeRecentPages(next);
      // 关闭的页签若被图钉固定，固定一并取消（用户显式关掉 = 不再常驻）。
      // 云端置顶但本机从未打开过的页签不在 recents 里，此时 path 本身就是 basePath。
      setPinnedTabs((pins) => {
        const hitBase = target?.basePath || path;
        const nextPins = pins.filter((p) => p.basePath !== hitBase);
        if (nextPins.length === pins.length) return pins;
        persistPinnedTabs(nextPins);
        return nextPins;
      });
      const currentBase = getActivePath || normalizePath(effectivePathname);
      if (target && target.basePath === currentBase) {
        const fallback = next[idx] || next[idx - 1] || { basePath: '/dashboard', path: '/dashboard' };
        if (fallback.basePath && fallback.basePath !== currentBase) navigate(fallback.basePath);
      }
      return next;
    });
  };

  /** 图钉固定/取消固定：固定后该页签常驻页签栏最前（跨登录跟随账号） */
  const togglePin = useCallback((basePath: string, title?: string) => {
    const base = String(basePath || '').trim();
    if (!base) return;
    setPinnedTabs((pins) => {
      const exists = pins.some((p) => p.basePath === base);
      const next = exists
        ? pins.filter((p) => p.basePath !== base)
        : [{ basePath: base, title: title || resolveRecentTitle(base, normalizePath(effectivePathname), language, localizedMenuConfig) || base, ts: Date.now() }, ...pins].slice(0, maxPinnedTabs);
      persistPinnedTabs(next);
      return next;
    });
  }, [effectivePathname, language, localizedMenuConfig, persistPinnedTabs]);

  // 展示合并：图钉固定的页签常驻最前（按固定顺序），其余按最近打开排序；
  // 固定页签的标题优先取最近打开里的最新标题（如"款号详情"跟随最近一次访问的款）
  const mergedRecentPages = useMemo<RecentPage[]>(() => {
    const pinnedBaseSet = new Set(pinnedTabs.map((p) => p.basePath));
    const rest = recentPages
      .filter((p) => !pinnedBaseSet.has(p.basePath))
      .map((p) => ({ ...p, pinned: false }));
    const pinnedList = pinnedTabs.map((pt) => {
      const match = recentPages.find((p) => p.basePath === pt.basePath);
      return {
        path: match?.path || pt.basePath,
        basePath: pt.basePath,
        title: match?.title || pt.title || pt.basePath,
        ts: match?.ts || pt.ts,
        pinned: true,
      };
    });
    return [...pinnedList, ...rest];
  }, [pinnedTabs, recentPages]);

  return { recentPages: mergedRecentPages, recentsContainerRef, activeTabRef, closeRecent, togglePin };
}

export { readRecentPages, writeRecentPages, resolveRecentTitle, recentPagesStorageKey, maxRecentPages, readPinnedTabs, writePinnedTabs, pinnedTabsStorageBase };
export type { RecentPage };
