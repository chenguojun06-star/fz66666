import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Badge, Button, Dropdown, Layout as AntLayout, Menu, Popover } from 'antd';
import { BellOutlined, CloseOutlined, DownOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined } from '@ant-design/icons';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/AuthContext';
import { menuConfig, resolvePermissionCode, paths } from '../../routeConfig';
import { useViewport } from '../../utils/useViewport';
import api, { ApiResult } from '../../utils/api';
import { getFullAuthedFileUrl } from '../../utils/fileUrl';
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

interface UrgentEvent {
  id: string;
  type: 'overdue' | 'defective' | 'approval';
  title: string;
  orderNo: string;
  time: string;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
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
  const [urgentEvents, setUrgentEvents] = useState<UrgentEvent[]>([]);

  // 标签栏滚动容器的ref
  const recentsContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  const { isMobile } = useViewport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const collapsed = sidebarCollapsed;
  const sidebarIsCollapsed = isMobile ? true : collapsed;
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>(() => (activeSectionKey ? [activeSectionKey] : []));

  // 获取紧急事件
  const fetchUrgentEvents = async () => {
    if (!isAuthenticated) {
      return;
    }
    try {
      const response = (await api.get('/dashboard/urgent-events', { timeout: 3000 })) as ApiResult<UrgentEvent[]>;
      if (response.code === 200) {
        setUrgentEvents(response.data || []);
      }
    } catch (error: any) {
      // 静默失败，不显示错误提示
      console.error('获取紧急事件失败:', error);
    }
  };

  const isAdmin = useMemo(() => isAdminUserFn(user), [user]);

  const hasPermissionForPath = (path: string) => {
    if (isAdmin) return true;
    const code = resolvePermissionCode(normalizePath(path));
    if (!code) return true;
    return Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(code));
  };

  // 构建 Menu items
  const menuItems = useMemo(() => {
    return menuConfig
      .filter((section) => {
        if (section.items) {
          return section.items.some((item) => hasPermissionForPath(item.path));
        }
        return hasPermissionForPath(section.path!);
      })
      .map((section) => {
        if (section.items) {
          const children = section.items
            .filter((item) => hasPermissionForPath(item.path))
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
  }, [menuConfig, user]);

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

  // 加载紧急事件
  useEffect(() => {
    fetchUrgentEvents();
    // 每5分钟刷新一次
    const timer = setInterval(fetchUrgentEvents, 300000);
    return () => clearInterval(timer);
  }, []);

  // 加载紧急事件
  useEffect(() => {
    fetchUrgentEvents();
    // 每5分钟刷新一次
    const timer = setInterval(fetchUrgentEvents, 300000);
    return () => clearInterval(timer);
  }, []);

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
    message.success('登出成功');
    navigate('/login');
  };

  const userDisplayName = String(user?.name || user?.username || '').trim() || '用户';
  const userInitial = userDisplayName.slice(0, 1).toUpperCase();

  // 个性化号：租户用户显示工厂名称，超管显示平台默认名称
  const brandName = String((user as any)?.tenantName || '').trim() || '云裳智链';

  // 实时更新浏览器标题
  useEffect(() => {
    document.title = brandName;
  }, [brandName]);

  return (
    <div className={`layout${collapsed ? ' layout-collapsed' : ''}`}>
      <header className="layout-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title header-brand" title={brandName}>{brandName}</h1>
            {recentPages.length ? (
              <div className="header-recents" role="tablist" aria-label="最近打开的页面" ref={recentsContainerRef}>
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
            {/* 紧急事件铃铛 */}
            <Popover
              placement="bottomRight"
              title="紧急事件"
              content={
                <div style={{ maxWidth: 360, maxHeight: 400, overflow: 'auto' }}>
                  {urgentEvents.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#999' }}>
                      暂无紧急事件
                    </div>
                  ) : (
                    <div>
                      {urgentEvents.map((event) => (
                        <div
                          key={event.id}
                          style={{
                            padding: '12px 0',
                            borderBottom: '1px solid #f0f0f0',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            // 根据类型跳转到对应页面
                            if (event.type === 'overdue') {
                              navigate(`/production?orderNo=${event.orderNo}`);
                            } else if (event.type === 'defective') {
                              navigate(`/production/warehousing?orderNo=${event.orderNo}`);
                            } else if (event.type === 'approval') {
                              navigate(`/finance/center?tab=factory`);
                            } else if (event.type === 'material') {
                              navigate(paths.materialInventory);
                            }
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: 4 }}>{event.title}</div>
                          <div style={{ fontSize: "var(--font-size-xs)", color: '#666' }}>
                            订单号: {event.orderNo}
                          </div>
                          <div style={{ fontSize: "var(--font-size-xs)", color: '#999', marginTop: 4 }}>
                            {event.time}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              }
              trigger="click"
            >
              <Badge count={urgentEvents.length} offset={[-2, 2]} size="small">
                <Button
                  type="text"
                  icon={<BellOutlined style={{ fontSize: "var(--font-size-xl)" }} />}
                  style={{ marginRight: 12 }}
                />
              </Badge>
            </Popover>

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
                aria-label={sidebarIsCollapsed ? '展开侧边栏' : '收起侧边栏'}
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
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};


export default Layout;
