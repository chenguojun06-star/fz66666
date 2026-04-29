import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Button, Dropdown, Tag } from 'antd';
import { CloseOutlined, DownOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../../utils/AuthContext';
import { paths } from '../../routeConfig';
import { useViewport } from '../../utils/useViewport';
import { getFullAuthedFileUrl } from '../../utils/fileUrl';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { t } from '../../i18n';
import SmartGuideBar from '@/smart/components/SmartGuideBar';
import { isSmartFeatureEnabled, triggerSmartFeatureRefresh } from '@/smart/core/featureFlags';
import { resolveSmartGlobalGuide } from '@/smart/core/globalGuide';
import SmartAlertBell from './SmartAlertBell';
import DailyTodoModal from './DailyTodoModal';
import FactoryPersonalCenterModal from './FactoryPersonalCenterModal';
import GlobalAiAssistant from '../common/GlobalAiAssistant';
import SideMenu from './SideMenu';
import { useLayoutAuth } from './useLayoutAuth';
import { useActivePath, useActiveSectionKey, useRecentPages } from './router';
import { menuConfig } from '../../routeConfig';
import './styles.css';

interface LayoutProps {
  children: ReactNode;
}

const sidebarCollapsedStorageKey = 'layout.sidebar.collapsed';

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language } = useAppLanguage();
  const { message } = App.useApp();
  const { isMobile } = useViewport();
  const auth = useLayoutAuth();

  const backgroundLocation = (location.state as any)?.backgroundLocation;
  const effectivePathname: string = backgroundLocation?.pathname || location.pathname;
  const effectiveSearch: string = backgroundLocation?.search || location.search;
  const effectiveFullPath = `${effectivePathname}${effectiveSearch || ''}`;

  const getActivePath = useActivePath(effectivePathname);
  const activeSectionKey = useActiveSectionKey(getActivePath);

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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const collapsed = sidebarCollapsed;
  const sidebarIsCollapsed = isMobile ? true : collapsed;
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>(() => (activeSectionKey ? [activeSectionKey] : []));
  const [factoryModalOpen, setFactoryModalOpen] = useState(false);

  const userDisplayName = String(user?.name || user?.username || '').trim() || t('layout.userDefault', language);
  const userInitial = userDisplayName.slice(0, 1).toUpperCase();

  const showGlobalSmartGuide = useMemo(() => isSmartFeatureEnabled('smart.guide.enabled'), []);
  const globalGuide = useMemo(() => resolveSmartGlobalGuide(effectivePathname), [effectivePathname]);

  const brandName = String((user as any)?.tenantName || '').trim() || t('login.brand', language);

  const localizedMenuConfig = useMemo(() => {
    return menuConfig.map((section) => ({ ...section }));
  }, []);

  const { recentPages, recentsContainerRef, activeTabRef, closeRecent } = useRecentPages(
    effectivePathname,
    effectiveSearch,
    effectiveFullPath,
    getActivePath,
    language,
    localizedMenuConfig,
  );

  const selectedKeys = useMemo(() => {
    return getActivePath ? [getActivePath] : [];
  }, [getActivePath]);

  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
      if (menuOpenKeys.length) setMenuOpenKeys([]);
    }
  }, [isMobile, menuOpenKeys.length]);

  useEffect(() => {
    triggerSmartFeatureRefresh();
    const timer = setInterval(triggerSmartFeatureRefresh, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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

  useEffect(() => {
    if (auth.isFactoryAccount && effectivePathname === '/dashboard') {
      navigate(paths.productionList);
    }
  }, [auth.isFactoryAccount, effectivePathname, navigate]);

  useEffect(() => {
    document.title = brandName;
  }, [brandName]);

  const handleLogout = () => {
    logout();
    message.success(t('layout.logoutSuccess', language));
    navigate('/login');
  };

  return (
    <div className={`layout${collapsed ? ' layout-collapsed' : ''}`}>
      <DailyTodoModal />
      {auth.isFactoryAccount && (
        <FactoryPersonalCenterModal open={factoryModalOpen} onClose={() => setFactoryModalOpen(false)} />
      )}
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
            {auth.isFactoryAccount && (
              <Tag color="orange" style={{ marginLeft: 0, marginRight: 8, fontSize: 12 }}>
                 {auth.factoryName || '外发工厂'}
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
                  if (key === 'profile') {
                    if (auth.isFactoryAccount) setFactoryModalOpen(true);
                    else navigate('/system/profile');
                  }
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
        <SideMenu
          sidebarIsCollapsed={sidebarIsCollapsed}
          isMobile={isMobile}
          selectedKeys={selectedKeys}
          menuOpenKeys={menuOpenKeys}
          activeSectionKey={activeSectionKey}
          onMenuOpenChange={setMenuOpenKeys}
          onSidebarCollapse={setSidebarCollapsed}
          auth={auth}
        />

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
        </main>
      </div>

      <GlobalAiAssistant />
    </div>
  );
};


export default Layout;
