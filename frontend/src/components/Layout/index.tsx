import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Drawer, Dropdown, message } from 'antd';
import { CloseOutlined, DownOutlined, LogoutOutlined, MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined, SettingOutlined } from '@ant-design/icons';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/authContext';
import { menuConfig, resolvePermissionCode } from '../../routeConfig';
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
  const sidebarExpandedStorageKey = 'layout.sidebar.expandedKey';
  const recentPagesStorageKey = 'layout.header.recentPages';
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

  const readExpandedKey = () => {
    try {
      const raw = localStorage.getItem(sidebarExpandedStorageKey);
      const v = String(raw || '').trim();
      return v || null;
    } catch {
      return null;
    }
  };

  const writeExpandedKey = (key: string | null) => {
    try {
      if (!key) {
        localStorage.removeItem(sidebarExpandedStorageKey);
        return;
      }
      localStorage.setItem(sidebarExpandedStorageKey, key);
    } catch {
    }
  };

  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = readExpandedKey();
    const initial = stored || activeSectionKey;
    return initial ? [initial] : [];
  });

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
      return [];
    }
  };

  const writeRecentPages = (pages: RecentPage[]) => {
    try {
      localStorage.setItem(recentPagesStorageKey, JSON.stringify(pages));
    } catch {
    }
  };

  const [recentPages, setRecentPages] = useState<RecentPage[]>(() => {
    if (typeof window === 'undefined') return [];
    return readRecentPages().slice(0, maxRecentPages);
  });

  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const collapsed = sidebarCollapsed;
  const isMobile = viewportWidth < 768;

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    setMobileNavOpen(false);
  }, [isMobile, effectivePathname]);

  useEffect(() => {
    if (!activeSectionKey) {
      setExpandedKeys([]);
      writeExpandedKey(null);
      return;
    }

    setExpandedKeys((prev) => {
      const current = prev[0] || null;
      if (current === activeSectionKey) return prev;
      writeExpandedKey(activeSectionKey);
      return [activeSectionKey];
    });
  }, [activeSectionKey]);

  const toggleSection = (key: string) => {
    setExpandedKeys((prev) => {
      const isOpen = prev.includes(key);
      const next = isOpen ? [] : [key];
      writeExpandedKey(next[0] || null);
      return next;
    });
  };

  const isExpanded = (key: string) => expandedKeys.includes(key);

  const isAdmin = useMemo(() => isAdminUserFn(user), [user]);

  const hasPermissionForPath = (path: string) => {
    if (isAdmin) return true;
    const code = resolvePermissionCode(normalizePath(path));
    if (!code) return true;
    return Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(code));
  };

  const activePath = getActivePath;
  const isActive = (path: string) => activePath === normalizePath(path);

  const resolveRecentTitle = (basePath: string | undefined, pathname: string) => {
    const base = basePath || pathname;
    if (base === '/style-info' && pathname !== base) return '款号详情';
    if (base === '/order-management' && pathname !== base) return '下单详情';
    if (base === '/production/cutting' && pathname.startsWith('/production/cutting/task/')) return '裁剪任务';
    if (base === '/production/warehousing' && pathname.startsWith('/production/warehousing/detail/')) return '质检入库详情';

    for (const section of menuConfig) {
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
    const title = resolveRecentTitle(basePath, normalizePath(effectivePathname));
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
    message.success('登出成功');
    navigate('/login');
  };

  const userDisplayName = String(user?.name || user?.username || '').trim() || '用户';
  const userInitial = userDisplayName.slice(0, 1).toUpperCase();

  return (
    <div className={`layout${collapsed ? ' layout-collapsed' : ''}`}>
      <header className="layout-header">
        <div className="header-content">
          <div className="header-left">
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label="打开菜单"
                onClick={() => setMobileNavOpen(true)}
                className="header-menu-btn"
              />
            ) : null}
            <h1 className="header-title header-brand">衣富ERP供应链生态</h1>
            {recentPages.length ? (
              <div className="header-recents" role="tablist" aria-label="最近打开的页面">
                {recentPages.map((p) => {
                  const isCurrent = p.path === effectiveFullPath;
                  return (
                    <div key={p.path} className={`recent-tab${isCurrent ? ' active' : ''}`}>
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
                        aria-label={`关闭 ${p.title}`}
                        onClick={() => closeRecent(p.path)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="header-user">
            <Dropdown
              placement="bottomRight"
              trigger={['click']}
              menu={{
                items: [
                  { key: 'profile', label: '个人中心', icon: <SettingOutlined /> },
                  { type: 'divider' },
                  { key: 'logout', label: '退出登录', icon: <LogoutOutlined /> },
                ] as any,
                onClick: ({ key }) => {
                  if (key === 'logout') handleLogout();
                  if (key === 'profile') navigate('/system/profile');
                },
              }}
            >
              <Button type="text" className="user-trigger">
                <Avatar size={28} className="user-avatar" src={(user as any)?.avatarUrl || undefined}>
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
        {!isMobile ? (
          <aside className="layout-sidebar">
            <div className="sidebar-tools">
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                aria-label={collapsed ? '展开菜单' : '收起菜单'}
                onClick={() => setSidebarCollapsed((v) => !v)}
              />
            </div>
            <nav className="sidebar-nav">
              {menuConfig.map((section) => (
                <div key={section.key} className={`nav-section ${isExpanded(section.key) ? 'expanded' : ''}`}>
                  {section.items ? (
                    <>
                      <div className="nav-section-header" onClick={() => toggleSection(section.key)}>
                        <span className={`nav-section-arrow ${isExpanded(section.key) ? 'expanded' : ''}`}>
                          <RightOutlined />
                        </span>
                        <span className="nav-icon">{section.icon}</span>
                        <h3 className="nav-section-title">
                          <span className="nav-section-title-text">{section.title}</span>
                        </h3>
                      </div>
                      {isExpanded(section.key) && (
                        <ul className="nav-list">
                          {section.items.filter((item) => hasPermissionForPath(item.path)).map((item) => (
                            <li key={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}>
                              <Link to={item.path} className="nav-link">
                                <span className="nav-icon">{item.icon}</span>
                                <span className="nav-label">{item.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    hasPermissionForPath(section.path!) ? (
                      <Link to={section.path!} style={{ textDecoration: 'none' }}>
                        <div className={`nav-section-header single-link ${isActive(section.path!) ? 'active' : ''}`}>
                          <span className="nav-section-arrow placeholder">
                            <RightOutlined />
                          </span>
                          <span className="nav-icon">{section.icon}</span>
                          <h3 className="nav-section-title">
                            <span className="nav-section-title-text">{section.title}</span>
                          </h3>
                        </div>
                      </Link>
                    ) : null
                  )}
                </div>
              ))}
            </nav>
          </aside>
        ) : (
          <Drawer
            title="菜单"
            placement="left"
            size={260}
            className="mobile-nav-drawer"
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
          >
            <nav className="sidebar-nav sidebar-nav-drawer">
              {menuConfig.map((section) => (
                <div key={section.key} className={`nav-section ${isExpanded(section.key) ? 'expanded' : ''}`}>
                  {section.items ? (
                    <>
                      <div className="nav-section-header" onClick={() => toggleSection(section.key)}>
                        <span className={`nav-section-arrow ${isExpanded(section.key) ? 'expanded' : ''}`}>
                          <RightOutlined />
                        </span>
                        <span className="nav-icon">{section.icon}</span>
                        <h3 className="nav-section-title">
                          <span className="nav-section-title-text">{section.title}</span>
                        </h3>
                      </div>
                      {isExpanded(section.key) && (
                        <ul className="nav-list">
                          {section.items.filter((item) => hasPermissionForPath(item.path)).map((item) => (
                            <li key={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}>
                              <Link to={item.path} className="nav-link" onClick={() => setMobileNavOpen(false)}>
                                <span className="nav-icon">{item.icon}</span>
                                <span className="nav-label">{item.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    hasPermissionForPath(section.path!) ? (
                      <Link to={section.path!} style={{ textDecoration: 'none' }} onClick={() => setMobileNavOpen(false)}>
                        <div className={`nav-section-header single-link ${isActive(section.path!) ? 'active' : ''}`}>
                          <span className="nav-section-arrow placeholder">
                            <RightOutlined />
                          </span>
                          <span className="nav-icon">{section.icon}</span>
                          <h3 className="nav-section-title">
                            <span className="nav-section-title-text">{section.title}</span>
                          </h3>
                        </div>
                      </Link>
                    ) : null
                  )}
                </div>
              ))}
            </nav>
          </Drawer>
        )}

        <main className="layout-content">
          <div className="content-wrapper">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};


export default Layout;
