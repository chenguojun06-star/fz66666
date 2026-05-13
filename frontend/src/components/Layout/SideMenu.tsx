import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Layout as AntLayout, Menu, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { menuConfig, paths } from '../../routeConfig';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { t } from '../../i18n';
import type { LayoutAuthResult } from './useLayoutAuth';
import { normalizePath } from './useLayoutAuth';

interface SideMenuProps {
  sidebarIsCollapsed: boolean;
  isMobile: boolean;
  selectedKeys: string[];
  menuOpenKeys: string[];
  activeSectionKey: string | null;
  onMenuOpenChange: (openKeys: string[]) => void;
  onSidebarCollapse: (collapsed: boolean) => void;
  auth: LayoutAuthResult;
}

const SideMenu: React.FC<SideMenuProps> = ({
  sidebarIsCollapsed,
  isMobile,
  selectedKeys,
  menuOpenKeys,
  activeSectionKey: _activeSectionKey,
  onMenuOpenChange,
  onSidebarCollapse,
  auth,
}) => {
  const { language } = useAppLanguage();
  const {
    isAdmin: _isAdmin,
    isSuperAdmin,
    isFactoryAccount,
    tenantModules,
    hasPermissionForPath,
    isTenantModuleEnabled,
    factoryVisibleSections,
    factoryVisiblePaths,
    alwaysVisiblePaths,
  } = auth;

  const menuI18nMapByPath = useMemo<Record<string, string>>(() => ({
    [paths.styleInfoList]: 'menu.items.styleInfo',
    [paths.dataCenter]: 'menu.items.dataCenter',
    [paths.templateCenter]: 'menu.items.templateCenter',
    [paths.productionList]: 'menu.items.productionList',
    [paths.materialPurchase]: 'menu.items.materialPurchase',
    [paths.productionPartners]: 'menu.items.factory',
    [paths.cutting]: 'menu.items.cutting',
    [paths.progressDetail]: 'menu.items.progressDetail',
    [paths.externalFactory]: 'menu.items.externalFactory',
    [paths.warehousing]: 'menu.items.warehousing',
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
    procurement: 'menu.sections.procurement',
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

  const menuItems = useMemo(() => {
    return localizedMenuConfig
      .filter((section) => {
        if (isFactoryAccount && !factoryVisibleSections.has(section.key)) return false;
        if (tenantModules && tenantModules.length > 0) {
          if (section.path && !alwaysVisiblePaths.has(section.path) && !tenantModules.includes(section.path)) return false;
          if (section.items && !section.items.some(item => isTenantModuleEnabled(item.path))) return false;
        }
        if (section.superAdminOnly && !isSuperAdmin) return false;
        if (section.items) {
          return section.items.some((item) =>
            (isFactoryAccount && factoryVisiblePaths.has(normalizePath(item.path))) || hasPermissionForPath(item.path)
          );
        }
        if (isFactoryAccount && factoryVisiblePaths.has(normalizePath(section.path!))) return true;
        return hasPermissionForPath(section.path!);
      })
      .map((section) => {
        if (section.items) {
          const children = section.items
            .filter((item) => {
              if ((item as any).superAdminOnly && !isSuperAdmin) return false;
              if (isFactoryAccount && !factoryVisiblePaths.has(normalizePath(item.path))) return false;
              if (!isTenantModuleEnabled(item.path)) return false;
              if (isFactoryAccount && factoryVisiblePaths.has(normalizePath(item.path))) return true;
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
            popupClassName: 'layout-sidebar-submenu-popup',
          };
        } else {
          if (sidebarIsCollapsed && !isMobile) {
            return {
              key: `${section.key}__collapsed_group`,
              icon: section.icon,
              label: section.title,
              children: [
                {
                  key: section.path!,
                  icon: section.icon,
                  label: <Link to={section.path!}>{section.title}</Link>,
                },
              ],
              popupClassName: 'layout-sidebar-submenu-popup',
            };
          }
          return {
            key: section.path!,
            icon: section.icon,
            label: <Link to={section.path!}>{section.title}</Link>,
          };
        }
      });
  }, [localizedMenuConfig, isSuperAdmin, isFactoryAccount, sidebarIsCollapsed, isMobile, alwaysVisiblePaths, factoryVisiblePaths, factoryVisibleSections, hasPermissionForPath, isTenantModuleEnabled, tenantModules]);

  const handleMenuOpenChange = (openKeys: string[]) => {
    if (sidebarIsCollapsed) return;
    onMenuOpenChange(openKeys);
  };

  const menuInteractionProps = sidebarIsCollapsed
    ? {
        triggerSubMenuAction: (isMobile ? 'click' : 'hover') as 'click' | 'hover',
        subMenuOpenDelay: 0,
        subMenuCloseDelay: 0.08,
      }
    : {
        openKeys: menuOpenKeys,
        onOpenChange: handleMenuOpenChange,
        triggerSubMenuAction: 'click' as const,
      };

  return (
    <AntLayout.Sider
      collapsible={!isMobile}
      collapsed={sidebarIsCollapsed}
      onCollapse={isMobile ? undefined : (v: boolean) => onSidebarCollapse(v)}
      width={window.innerWidth >= 3840 ? 320 : window.innerWidth >= 2560 ? 280 : 210}
      collapsedWidth={window.innerWidth >= 2560 ? 72 : 64}
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
            onClick={() => onSidebarCollapse(!sidebarIsCollapsed)}
          />
        </div>
      ) : null}
      <Menu
        mode="inline"
        selectedKeys={selectedKeys}
        items={menuItems}
        inlineCollapsed={sidebarIsCollapsed}
        getPopupContainer={() => document.body}
        {...menuInteractionProps}
        className="sidebar-menu"
      />
      {sidebarIsCollapsed && !isMobile ? (
        <div className="sidebar-icp-collapsed">
          <Tooltip
            placement="rightBottom"
            classNames={{ root: 'sidebar-icp-tooltip' }}
            title={(
              <div className="sidebar-icp-tooltip-content">
                <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352" target="_blank" rel="noopener noreferrer">
                  粤公网安备44011302005352号
                </a>
                <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
                  粤ICP备2026026776号-1
                </a>
              </div>
            )}
          >
            <Button type="text" className="sidebar-icp-collapsed-btn">
              <img loading="lazy" src="/police.png" alt="公安备案图标" className="sidebar-icp-collapsed-icon" />
              <span>备案</span>
            </Button>
          </Tooltip>
        </div>
      ) : null}
      {!sidebarIsCollapsed && !isMobile && (
        <div className="sidebar-icp">
          <div className="sidebar-icp-links">
            <div className="sidebar-icp-link-row">
              <img loading="lazy" src="/police.png" alt="公安备案图标" className="sidebar-icp-icon" />
              <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352" target="_blank" rel="noopener noreferrer">
                粤公网安备44011302005352号
              </a>
            </div>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
              粤ICP备2026026776号-1
            </a>
          </div>
        </div>
      )}
    </AntLayout.Sider>
  );
};

export default SideMenu;
