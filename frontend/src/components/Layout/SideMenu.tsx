import React, { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Layout as AntLayout, Menu, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { menuConfig, paths } from '../../routeConfig';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { t } from '../../i18n';
import type { LayoutAuthResult } from './useLayoutAuth';
import { normalizePath } from './useLayoutAuth';

interface SideMenuProps {
  sidebarIsCollapsed: boolean;
  /** 设备是否有鼠标/触控板（决定「悬停展开」还是「点击展开」） */
  hasHoverPointer: boolean;
  selectedKeys: string[];
  menuOpenKeys: string[];
  activeSectionKey: string | null;
  onMenuOpenChange: (openKeys: string[]) => void;
  onSidebarCollapse: (collapsed: boolean) => void;
  auth: LayoutAuthResult;
  badgeCounts: Record<string, number>;
  onMenuClick: (path: string) => void;
}

const SideMenu: React.FC<SideMenuProps> = ({
  sidebarIsCollapsed,
  hasHoverPointer,
  selectedKeys,
  menuOpenKeys,
  activeSectionKey: _activeSectionKey,
  onMenuOpenChange,
  onSidebarCollapse,
  auth,
  badgeCounts,
  onMenuClick,
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
    [paths.salaryConfig]: 'menu.items.salaryConfig',
    [paths.deductionManage]: 'menu.items.deductionManage',
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

  /**
   * 单个菜单项是否对当前用户可见。
   *
   * ⚠️ 必须**同时**用于「section 是否保留」和「子项是否保留」两处判断。
   *
   * 原来的 bug（2026-09-25 修）：外层用宽松条件（factoryVisible || hasPermission），
   * 内层用严格条件（额外还有 isTenantModuleEnabled）→ 某些 section 外层通过、
   * 内层子项被全部过滤 → 渲染出**没有子菜单的空 SubMenu**。
   * 折叠态下悬停这种空 SubMenu 弹层是空的，表现为"有的菜单悬停看得到文字、有的看不到"。
   * 统一成一个判定后，子项为空的 section 会被整体丢弃，不会再产生空弹层。
   */
  const isItemVisible = useCallback((item: { path: string; superAdminOnly?: boolean }) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (isFactoryAccount && !factoryVisiblePaths.has(normalizePath(item.path))) return false;
    if (!isTenantModuleEnabled(item.path)) return false;
    // 工厂账号的可见路径是白名单制，直接放行；其余按权限码判定
    if (isFactoryAccount && factoryVisiblePaths.has(normalizePath(item.path))) return true;
    return hasPermissionForPath(item.path);
  }, [isSuperAdmin, isFactoryAccount, factoryVisiblePaths, isTenantModuleEnabled, hasPermissionForPath]);

  const menuItems = useMemo(() => {
    return localizedMenuConfig
      .filter((section) => {
        if (isFactoryAccount && !factoryVisibleSections.has(section.key)) return false;
        if (tenantModules && tenantModules.length > 0) {
          if (section.path && !alwaysVisiblePaths.has(section.path) && !tenantModules.includes(section.path)) return false;
          if (section.items && !section.items.some(item => isTenantModuleEnabled(item.path))) return false;
        }
        if (section.superAdminOnly && !isSuperAdmin) return false;
        // 与子项过滤用同一判定，避免"外层保留、内层全空"→ 空 SubMenu
        if (section.items) {
          return section.items.some(isItemVisible);
        }
        if (isFactoryAccount && factoryVisiblePaths.has(normalizePath(section.path!))) return true;
        return hasPermissionForPath(section.path!);
      })
      .map((section) => {
        if (section.items) {
          const children = section.items
            .filter(isItemVisible)
            .map((item) => {
              const itemPath = item.path;
              const badgeCount = badgeCounts[itemPath] || 0;
              return {
                key: itemPath,
                icon: item.icon,
                label: (
                  <span
                    className="u-d-flex u-ai-center u-jc-between u-w-full"
                    onClick={() => { if (badgeCount > 0) onMenuClick(itemPath); }}
                  >
                    <Link to={itemPath}>{item.label}</Link>
                    {badgeCount > 0 && (
                      <Badge
                        count={badgeCount}
                        size="small"
                        style={{ backgroundColor: 'var(--color-danger)', boxShadow: 'none' }}
                      />
                    )}
                  </span>
                ),
              };
            });

          // 子项全被过滤掉时整体丢弃该 section —— 否则会渲染出空 SubMenu，
          // 折叠态悬停时弹层为空（就是"有的菜单悬停看不到文字"的直接原因）
          if (children.length === 0) return null;

          return {
            key: section.key,
            icon: section.icon,
            label: section.title,
            children,
            popupClassName: 'layout-sidebar-submenu-popup',
          };
        } else {
          // 折叠态下，无子菜单的顶层项包一层假 SubMenu，悬停时弹出该项本身。
          // 注意：这里**不要**加 title —— rc-menu 的 nodeUtil 会把 label 覆盖到 title 上
          // （`{...restProps, title: label}`），加了也是无效值，反而误导后人。
          // 判据用 sidebarIsCollapsed 本身（而非 isMobile），窄窗口的桌面端才能拿到一致的悬停体验
          if (sidebarIsCollapsed) {
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
            // 真·顶层 MenuItem 才吃 title：antd MenuItem 在折叠态用它作 tooltip 文案
            // （不传时回退为 children，即 label）。显式传字符串可避免 tooltip 里渲染 <Link> 节点
            title: sidebarIsCollapsed ? section.title : undefined,
          };
        }
      })
      // 丢掉「子项全被过滤」的 section（map 里对空 children 返回了 null）
      .filter((node): node is NonNullable<typeof node> => node !== null);
  }, [localizedMenuConfig, isSuperAdmin, isFactoryAccount, sidebarIsCollapsed, alwaysVisiblePaths, factoryVisiblePaths, factoryVisibleSections, hasPermissionForPath, isTenantModuleEnabled, tenantModules, badgeCounts, onMenuClick, isItemVisible]);

  const handleMenuOpenChange = (openKeys: string[]) => {
    if (sidebarIsCollapsed) return;
    onMenuOpenChange(openKeys);
  };

  /**
   * 折叠态下子菜单的展开方式。
   *
   * ⚠️ 原来用 `isMobile`（窗口宽度 < 768）判断，导致桌面用户把窗口拉窄后
   * 悬停失效、必须点击才能展开子菜单（2026-09-25 用户报障）。
   * 正确信号是**有没有鼠标**：有鼠标就悬停展开，触摸屏才用点击。
   */
  const menuInteractionProps = sidebarIsCollapsed
    ? {
        triggerSubMenuAction: (hasHoverPointer ? 'hover' : 'click') as 'click' | 'hover',
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
      collapsible={hasHoverPointer}
      collapsed={sidebarIsCollapsed}
      onCollapse={hasHoverPointer ? (v: boolean) => onSidebarCollapse(v) : undefined}
      width={window.innerWidth >= 3840 ? 320 : window.innerWidth >= 2560 ? 280 : 210}
      collapsedWidth={window.innerWidth >= 2560 ? 72 : 64}
      trigger={null}
      className="layout-sidebar"
    >
      {/* 折叠开关：有鼠标就给（含窗口较窄的桌面场景），触摸屏才隐藏 */}
      {hasHoverPointer ? (
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
      {sidebarIsCollapsed ? (
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
      {!sidebarIsCollapsed && (
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
