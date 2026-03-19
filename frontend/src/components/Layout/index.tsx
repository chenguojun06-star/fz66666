import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Button, Dropdown, Layout as AntLayout, Menu, Tag } from 'antd';
import { CloseOutlined, DownOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined } from '@ant-design/icons';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/AuthContext';
import { menuConfig, resolvePermissionCode, paths } from '../../routeConfig';
import { useViewport } from '../../utils/useViewport';
import { getFullAuthedFileUrl } from '../../utils/fileUrl';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { t } from '../../i18n';
import SmartGuideBar from '@/smart/components/SmartGuideBar';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import { resolveSmartGlobalGuide } from '@/smart/core/globalGuide';
import SmartAlertBell from './SmartAlertBell';
import DailyTodoModal from './DailyTodoModal';
import GlobalAiAssistant from '../common/GlobalAiAssistant';
import './styles.css';

interface LayoutProps {
  children: ReactNode;
}

type RecentPage = {
  path: string;
  basePath: string;
  title: string;
  ts: number;
};


const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language } = useAppLanguage();
  const { message } = App.useApp();
  const recentPagesStorageKey = 'layout.header.recentPages';
  const sidebarCollapsedStorageKey = 'layout.sidebar.collapsed';
  const maxRecentPages = 12;

  const normalizePath = (path: string) => path.split('?')[0];

  const backgroundLocation = (location.state as any)?.backgroundLocation;
  const effectivePathname: string = backgroundLocation?.pathname || location.pathname;
  const effectiveSearch: string = backgroundLocation?.search || location.search;
  const effectiveFullPath = `${effectivePathname}${effectiveSearch || ''}`;

  const getActivePath = useMemo(() => {
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

  const activeSectionKey = useMemo(() => {
    if (!getActivePath) return null;
    for (const section of menuConfig) {
      if (section.items?.some((it) => normalizePath(it.path) === getActivePath)) return section.key;
      if (section.path && normalizePath(section.path) === getActivePath) return section.key;
    }
    return null;
  }, [getActivePath]);

  const readRecentPages = (): RecentPage[] => {
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
      // Intentionally empty
      // 忽略错误
      return [];
    }
  };

  const readSidebarCollapsed = () => {
    if (typeof window === 'undefined') return isMobile;
    try {
      const raw = localStorage.getItem(sidebarCollapsedStorageKey);
      if (raw === null) return isMobile;
      return raw === 'true';
    } catch {
      return isMobile;
    }
  };

  const writeRecentPages = (pages: RecentPage[]) => {
    try {
      localStorage.setItem(recentPagesStorageKey, JSON.stringify(pages));
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  };

  const [recentPages, setRecentPages] = useState<RecentPage[]>(() => {
    if (typeof window === 'undefined') return [];
    return readRecentPages().slice(0, maxRecentPages);
  });
  // 标签栏滚动容器的ref
  const recentsContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  const { isMobile } = useViewport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const collapsed = sidebarCollapsed;
  const sidebarIsCollapsed = isMobile ? true : collapsed;
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>(() => (activeSectionKey ? [activeSectionKey] : []));

  const isAdmin = useMemo(() => isAdminUserFn(user), [user]);
  const isSuperAdmin = user?.isSuperAdmin === true;

  const menuI18nMapByPath = useMemo<Record<string, string>>(() => ({
    [paths.styleInfoList]: 'menu.items.styleInfo',
    [paths.patternProduction]: 'menu.items.patternProduction',
    [paths.dataCenter]: 'menu.items.dataCenter',
    [paths.templateCenter]: 'menu.items.templateCenter',
    [paths.orderManagementList]: 'menu.items.orderManagement',
    [paths.productionList]: 'menu.items.productionList',
    [paths.materialPurchase]: 'menu.items.materialPurchase',
    [paths.cutting]: 'menu.items.cutting',
    [paths.progressDetail]: 'menu.items.progressDetail',
    [paths.warehousing]: 'menu.items.warehousing',
    [paths.warehouseDashboard]: 'menu.items.warehouseDashboard',
    [paths.materialInventory]: 'menu.items.materialInventory',
    [paths.materialDatabase]: 'menu.items.materialDatabase',
    [paths.finishedInventory]: 'menu.items.finishedInventory',
    [paths.sampleInventory]: 'menu.items.sampleInventory',
    [paths.materialReconciliation]: 'menu.items.materialReconciliation',
    [paths.payrollOperatorSummary]: 'menu.items.payrollOperatorSummary',
    [paths.financeCenter]: 'menu.items.financeCenter',
    [paths.expenseReimbursement]: 'menu.items.expenseReimbursement',
    [paths.wagePayment]: 'menu.items.wagePayment',
    [paths.profile]: 'menu.items.profile',
    [paths.user]: 'menu.items.user',
    [paths.role]: 'menu.items.role',
    [paths.factory]: 'menu.items.factory',
    [paths.dict]: 'menu.items.dict',
    [paths.systemLogs]: 'menu.items.systemLogs',
    [paths.tutorial]: 'menu.items.tutorial',
    [paths.dataImport]: 'menu.items.dataImport',
  }), []);

  const menuI18nMapBySectionKey = useMemo<Record<string, string>>(() => ({
    dashboard: 'menu.sections.dashboard',
    basic: 'menu.sections.basic',
    production: 'menu.sections.production',
    warehouse: 'menu.sections.warehouse',
    finance: 'menu.sections.finance',
    system: 'menu.sections.system',
    appStore: 'menu.sections.appStore',
    customer: 'menu.sections.customer',
    tenant: 'menu.sections.tenant',
    integrationCenter: 'menu.sections.integrationCenter',
  }), []);

  const localizedMenuConfig = useMemo(() => {
    return menuConfig.map((section) => {
      const localizedTitle = t(menuI18nMapBySectionKey[section.key] || '', language);
      if (section.items?.length) {
        return {
          ...section,
          title: localizedTitle === '' || localizedTitle.includes('menu.sections.') ? section.title : localizedTitle,
          items: section.items.map((item) => {
            const localizedLabel = t(menuI18nMapByPath[normalizePath(item.path)] || '', language);
            return {
              ...item,
              label: localizedLabel === '' || localizedLabel.includes('menu.items.') ? item.label : localizedLabel,
            };
          }),
        };
      }
      return {
        ...section,
        title: localizedTitle === '' || localizedTitle.includes('menu.sections.') ? section.title : localizedTitle,
      };
    });
  }, [language, menuI18nMapByPath, menuI18nMapBySectionKey]);

  const hasPermissionForPath = (path: string) => {
    if (isAdmin) return true;
    const code = resolvePermissionCode(normalizePath(path));
    if (!code) return true;
    return Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(code));
  };

  // 外发工厂联系人账号识别：factoryId 有値表示该用户是某外发工厂的联系人
  const isFactoryAccount = !!(user as any)?.factoryId;

  // 租户模块白名单（undefined/空数组=全部开放，有值则按路径白名单过滤侧边栏）
  const tenantModules = (user as any)?.tenantModules as string[] | undefined;
  const isTenantModuleEnabled = (path: string) =>
    !tenantModules || tenantModules.length === 0 || tenantModules.includes(path);

  // 这些顶层路径始终显示，不受租户模块白名单控制
  const ALWAYS_VISIBLE_PATHS = new Set(['/integration/center', '/system/app-store']);

  // 工厂账号可见的菜单分组键（其余整组隐藏）
  const FACTORY_VISIBLE_SECTIONS = new Set<string>(['production', 'finance', 'system']);
  // 工厂账号可见的具体路径白名单
  const FACTORY_VISIBLE_PATHS = new Set<string>([
    paths.productionList,   // /production（我的订单）
    paths.progressDetail,   // /production/progress-detail（生产进度）
    paths.cutting,          // /production/cutting（裁剪管理）
    paths.warehousing,      // /production/warehousing（成品入库）
    paths.materialPurchase, // /production/material（面辅料采购）
    paths.financeCenter,    // /finance/center（订单结算(外)）
    paths.profile,          // /system/profile（个人中心）
    paths.factoryWorkers,   // /system/factory-workers（工人名册）
  ]);

  // 构建 Menu items
  const menuItems = useMemo(() => {
    return localizedMenuConfig
      .filter((section) => {
        // 外发工厂账号：只显示指定分组，其余整组隐藏
        if (isFactoryAccount && !FACTORY_VISIBLE_SECTIONS.has(section.key)) return false;
        // 租户模块白名单：若设置了白名单，则隐藏整个无启用项的分组
        // 注意：ALWAYS_VISIBLE_PATHS 中的路径始终显示，不受白名单控制
        if (tenantModules && tenantModules.length > 0) {
          if (section.path && !ALWAYS_VISIBLE_PATHS.has(section.path) && !tenantModules.includes(section.path)) return false;
          if (section.items && !section.items.some(item => isTenantModuleEnabled(item.path))) return false;
        }
        // 超管专属菜单：非超管不可见
        if (section.superAdminOnly && !isSuperAdmin) return false;
        if (section.items) {
          return section.items.some((item) => hasPermissionForPath(item.path));
        }
        return hasPermissionForPath(section.path!);
      })
      .map((section) => {
        if (section.items) {
          const children = section.items
            .filter((item) => {
              if ((item as any).superAdminOnly && !isSuperAdmin) return false;
              // 外发工厂账号：只显示白名单内的页面
              if (isFactoryAccount && !FACTORY_VISIBLE_PATHS.has(item.path)) return false;
              // 租户模块白名单：路径不在白名单内则隐藏
              if (!isTenantModuleEnabled(item.path)) return false;
              return hasPermissionForPath(item.path);
            })
            .map((item) => ({
              key: item.path,
              icon: item.icon,
              label: <Link to={item.path}>{item.label}</Link>,
            }));

          return {
            key: section.key,
            icon: section.icon,
            label: section.title,
            children: children.length > 0 ? children : undefined,
          };
        } else {
          return {
            key: section.path!,
            icon: section.icon,
            label: <Link to={section.path!}>{section.title}</Link>,
          };
        }
      });
  }, [localizedMenuConfig, user, isSuperAdmin, isFactoryAccount]);

  // 获取当前选中的菜单项
  const selectedKeys = useMemo(() => {
    return getActivePath ? [getActivePath] : [];
  }, [getActivePath]);

  const handleMenuOpenChange = (openKeys: string[]) => {
    if (sidebarIsCollapsed) return;
    setMenuOpenKeys(openKeys);
  };

  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
      if (menuOpenKeys.length) setMenuOpenKeys([]);
    }
  }, [isMobile, menuOpenKeys.length]);

  useEffect(() => {
    if (isMobile) return;
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(sidebarCollapsedStorageKey);
      if (raw === null) return;
      setSidebarCollapsed(raw === 'true');
    } catch {
      return;
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(sidebarCollapsedStorageKey, String(sidebarCollapsed));
    } catch {
      return;
    }
  }, [isMobile, sidebarCollapsed]);

  useEffect(() => {
    if (sidebarIsCollapsed) return;
    if (!activeSectionKey) {
      if (menuOpenKeys.length) setMenuOpenKeys([]);
      return;
    }
    if (!menuOpenKeys.includes(activeSectionKey)) {
      setMenuOpenKeys([activeSectionKey]);
    }
  }, [activeSectionKey, menuOpenKeys, sidebarIsCollapsed]);

  const resolveRecentTitle = (basePath: string | undefined, pathname: string) => {
    const base = basePath || pathname;
    if (base === '/style-info' && pathname !== base) return t('layout.styleInfoDetail', language);
    if (base === '/order-management' && pathname !== base) return t('layout.orderDetail', language);
    if (base === '/production/cutting' && pathname.startsWith('/production/cutting/task/')) return t('layout.cuttingTask', language);
    if (base === '/production/warehousing' && pathname.startsWith('/production/warehousing/detail/')) return t('layout.warehousingDetail', language);

    for (const section of localizedMenuConfig) {
      if (section.path && normalizePath(section.path) === base) return section.title;
      if (section.items?.length) {
        for (const item of section.items) {
          if (normalizePath(item.path) === base) return item.label;
        }
      }
    }
    return base;
  };

  useEffect(() => {
    if (!effectivePathname) return;
    if (normalizePath(effectivePathname) === '/login') return;

    const basePath = getActivePath || normalizePath(effectivePathname);
    let title = resolveRecentTitle(basePath, normalizePath(effectivePathname));
    // 工人名册页面带工厂名动态 tab 标题
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

  // 当活动标签变化时，自动滚动到可见区域
  useEffect(() => {
    if (!activeTabRef.current || !recentsContainerRef.current) return;

    // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
    requestAnimationFrame(() => {
      if (!activeTabRef.current || !recentsContainerRef.current) return;

      const container = recentsContainerRef.current;
      const activeTab = activeTabRef.current;

      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();

      // 计算标签相对于容器的位置
      const tabLeft = tabRect.left - containerRect.left + container.scrollLeft;
      const tabRight = tabLeft + tabRect.width;

      // 如果标签在可见区域外，则滚动到可见位置
      if (tabLeft < container.scrollLeft) {
        // 标签在左侧视野外，滚动到左边缘
        container.scrollLeft = tabLeft - 10; // 留10px边距
      } else if (tabRight > container.scrollLeft + containerRect.width) {
        // 标签在右侧视野外，滚动到右边缘
        container.scrollLeft = tabRight - containerRect.width + 10; // 留10px边距
      }
      // 如果标签已在可见区域内，不进行滚动
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

  // 登出处理
  const handleLogout = () => {
    logout();
    message.success(t('layout.logoutSuccess', language));
    navigate('/login');
  };

  const userDisplayName = String(user?.name || user?.username || '').trim() || t('layout.userDefault', language);
  const userInitial = userDisplayName.slice(0, 1).toUpperCase();

  const showGlobalSmartGuide = useMemo(() => isSmartFeatureEnabled('smart.guide.enabled'), []);
  const globalGuide = useMemo(() => resolveSmartGlobalGuide(effectivePathname), [effectivePathname]);

  // 个性化号：租户用户显示工厂名称，超管显示平台默认名称
  const brandName = String((user as any)?.tenantName || '').trim() || t('login.brand', language);

  // 工厂账号登录后跳转到生产列表（避免停留在仔表盘）
  useEffect(() => {
    if (isFactoryAccount && effectivePathname === '/dashboard') {
      navigate('/production/list');
    }
  }, [isFactoryAccount, effectivePathname, navigate]);

  // 实时更新浏览器标题
  useEffect(() => {
    document.title = brandName;
  }, [brandName]);

  return (
    <div className={`layout${collapsed ? ' layout-collapsed' : ''}`}>
      <DailyTodoModal />
      <header className="layout-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title header-brand" title={brandName}>{brandName}</h1>
            {recentPages.length ? (
              <div className="header-recents" role="tablist" aria-label={t('layout.recentPages', language)} ref={recentsContainerRef}>
                {recentPages.map((p) => {
                  const isCurrent = p.path === effectiveFullPath;
                  return (
                    <div
                      key={p.path}
                      className={`recent-tab${isCurrent ? ' active' : ''}`}
                      ref={isCurrent ? activeTabRef : null}
                    >
                      <Button
                        type="text"
                        size="small"
                        className="recent-tab-label"
                        title={p.path}
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={() => {
                          if (p.path !== effectiveFullPath) navigate(p.path);
                        }}
                      >
                        {p.title}
                      </Button>
                      <Button
                        type="text"
                        size="small"
                        className="recent-tab-close"
                        icon={<CloseOutlined />}
                        aria-label={`${t('layout.close', language)} ${p.title}`}
                        onClick={() => closeRecent(p.path)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="header-user">
            <SmartAlertBell />

            {isFactoryAccount && (
              <Tag color="orange" style={{ marginLeft: 0, marginRight: 8, fontSize: 12 }}>
                🏭 外发工厂端
              </Tag>
            )}

            <Dropdown
              placement="bottomRight"
              trigger={['click']}
              menu={{
                items: [
                  { key: 'profile', label: t('layout.profile', language), icon: <SettingOutlined /> },
                  { type: 'divider' },
                  { key: 'logout', label: t('layout.logout', language), icon: <LogoutOutlined /> },
                ] as any,
                onClick: ({ key }) => {
                  if (key === 'logout') handleLogout();
                  if (key === 'profile') navigate('/system/profile');
                },
              }}
            >
              <Button type="text" className="user-trigger">
                <Avatar size={28} className="user-avatar" src={getFullAuthedFileUrl((user as any)?.avatarUrl as string) || undefined}>
                  {userInitial}
                </Avatar>
                <span className="user-name">{userDisplayName}</span>
                <DownOutlined className="user-caret" />
              </Button>
            </Dropdown>
          </div>
        </div>
      </header>

      <div className="layout-main">
        <AntLayout.Sider
          collapsible={!isMobile}
          collapsed={sidebarIsCollapsed}
          onCollapse={isMobile ? undefined : setSidebarCollapsed}
          width={180}
          collapsedWidth={64}
          trigger={null}
          className="layout-sidebar"
        >
          {!isMobile ? (
            <div className="sidebar-tools">
              <Button
                type="text"
                className="sidebar-collapse-btn"
                icon={sidebarIsCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                aria-label={sidebarIsCollapsed ? t('layout.expandSidebar', language) : t('layout.collapseSidebar', language)}
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              />
            </div>
          ) : null}
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            openKeys={sidebarIsCollapsed ? undefined : menuOpenKeys}
            onOpenChange={handleMenuOpenChange}
            items={menuItems}
            inlineCollapsed={sidebarIsCollapsed}
            triggerSubMenuAction={sidebarIsCollapsed ? (isMobile ? 'click' : 'hover') : 'click'}
            className="sidebar-menu"
          />
        </AntLayout.Sider>

        <main className="layout-content">
          <div className="content-wrapper">
            {showGlobalSmartGuide && globalGuide ? (
              <div style={{ marginBottom: 12 }}>
                <SmartGuideBar
                  stage={globalGuide.stage}
                  nextStep={globalGuide.nextStep}
                  hints={globalGuide.hints}
                  pendingCount={globalGuide.hints.filter((item) => item.level !== 'low').length}
                />
              </div>
            ) : null}
            {children}
          </div>
          <div style={{ textAlign: 'center', padding: '6px 0 8px', fontSize: 11, color: '#bbb' }}>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
               style={{ color: '#bbb' }}>粤ICP备2026026776号-1</a>
          </div>
        </main>
      </div>

      <GlobalAiAssistant />
    </div>
  );
};


export default Layout;
