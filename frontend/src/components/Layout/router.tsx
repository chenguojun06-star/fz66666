import { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { menuConfig } from '../../routeConfig';
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
  if (base === '/intelligence/agent-traces') return 'AI执行记录中心';
  if (base === '/ecommerce/center') return '平台总览';
  if (base === '/ecommerce/platform') return '平台详情';
  if (base === '/warehouse/ecommerce') return '电商订单';
  if (base === '/finance/ec-revenue') return 'EC销售收入';
  if (base === '/crm') return '客户档案';
  if (base === '/crm/receivables') return '应收账款';
  if (base === '/finance/receivables') return '应收账款';
  if (base === '/finance/payable') return '应付账款';
  if (base === '/finance/payment-schedule') return '付款计划';
  if (base === '/finance/employee-advance') return '员工借支';
  if (base === '/finance/expense-management') return '费用管理';
  if (base === '/finance/tax-export') return '财税导出';
  if (base === '/finance/dashboard') return '财务总览';
  if (base === '/warehouse/product-info') return '成品资料';
  if (base === '/warehouse/label-print') return '标签打印';
  if (base === '/warehouse/inventory-check') return '库存盘点';
  if (base === '/production/picking') return '物料领料';
  if (base === '/production/transfer') return '订单转移';
  if (base === '/production/order-flow') return '订单流程';
  if (base === '/basic/maintenance-center') return '资料单价';
  if (base === '/order-management') return '下单管理';
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
      const currentBase = getActivePath || normalizePath(effectivePathname);
      if (target && target.basePath === currentBase) {
        const fallback = next[idx] || next[idx - 1] || { basePath: '/dashboard', path: '/dashboard' };
        if (fallback.basePath && fallback.basePath !== currentBase) navigate(fallback.basePath);
      }
      return next;
    });
  };

  return { recentPages, recentsContainerRef, activeTabRef, closeRecent };
}

export { readRecentPages, writeRecentPages, resolveRecentTitle, recentPagesStorageKey, maxRecentPages };
export type { RecentPage };
