import React from 'react';
import type { ReactNode } from 'react';
import {
  AccountBookOutlined,
  AppstoreOutlined,
  BookOutlined,
  BuildOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  ShoppingCartOutlined,
  ScissorOutlined,
} from '@ant-design/icons';

export const paths = {
  root: '/',
  login: '/login',

  dashboard: '/dashboard',

  styleInfoList: '/style-info',
  styleInfoDetail: '/style-info/:id',

  orderManagementList: '/order-management',
  orderManagementDetail: '/order-management/:styleNo',

  dataCenter: '/data-center',
  templateCenter: '/basic/template-center',

  productionList: '/production',
  materialPurchase: '/production/material',
  cutting: '/production/cutting',
  cuttingTask: '/production/cutting/task/:orderNo',
  progressDetail: '/production/progress-detail',
  orderFlow: '/production/order-flow',
  warehousing: '/production/warehousing',
  warehousingDetail: '/production/warehousing/detail/:warehousingNo',

  materialReconciliation: '/finance/material-reconciliation',
  shipmentReconciliation: '/finance/shipment-reconciliation',
  paymentApproval: '/finance/payment-approval',
  payrollOperatorSummary: '/finance/payroll-operator-summary',

  profile: '/system/profile',
  user: '/system/user',
  role: '/system/role',
  factory: '/system/factory',
  loginLog: '/system/login-log',
} as const;

export const permissionCodes = {
  dashboard: 'MENU_DASHBOARD',
  styleInfo: 'MENU_STYLE_INFO',
  orderManagement: 'MENU_ORDER_MANAGEMENT',
  dataCenter: 'MENU_DATA_CENTER',
  templateCenter: 'MENU_TEMPLATE_CENTER',

  productionList: 'MENU_PRODUCTION_LIST',
  materialPurchase: 'MENU_MATERIAL_PURCHASE',
  cutting: 'MENU_CUTTING',
  progress: 'MENU_PROGRESS',
  warehousing: 'MENU_WAREHOUSING',

  materialRecon: 'MENU_MATERIAL_RECON',
  shipmentRecon: 'MENU_SHIPMENT_RECON',
  paymentApproval: 'MENU_PAYMENT_APPROVAL',

  user: 'MENU_USER',
  role: 'MENU_ROLE',
  factory: 'MENU_FACTORY',
  loginLog: 'MENU_LOGIN_LOG',
} as const;

export type MenuItem = {
  label: string;
  path: string;
  icon?: ReactNode;
};

export type MenuSection = {
  title: string;
  key: string;
  icon?: ReactNode;
  items?: MenuItem[];
  path?: string;
};

export const menuConfig: MenuSection[] = [
  {
    title: '仪表盘',
    key: 'dashboard',
    icon: React.createElement(DashboardOutlined),
    path: paths.dashboard,
  },
  {
    title: '基础资料',
    key: 'basic',
    icon: React.createElement(AppstoreOutlined),
    items: [
      { label: '款号资料', path: paths.styleInfoList, icon: React.createElement(FileTextOutlined) },
      { label: '下单管理', path: paths.orderManagementList, icon: React.createElement(FileTextOutlined) },
      { label: '资料中心', path: paths.dataCenter, icon: React.createElement(DatabaseOutlined) },
      { label: '单价流程', path: paths.templateCenter, icon: React.createElement(BookOutlined) },
    ],
  },
  {
    title: '生产管理',
    key: 'production',
    icon: React.createElement(BuildOutlined),
    items: [
      { label: '我的订单', path: paths.productionList, icon: React.createElement(BuildOutlined) },
      { label: '物料采购', path: paths.materialPurchase, icon: React.createElement(ShoppingCartOutlined) },
      { label: '裁剪管理', path: paths.cutting, icon: React.createElement(ScissorOutlined) },
      { label: '生产进度', path: paths.progressDetail, icon: React.createElement(FileSearchOutlined) },
      { label: '质检入库', path: paths.warehousing, icon: React.createElement(InboxOutlined) },
    ],
  },
  {
    title: '财务管理',
    key: 'finance',
    icon: React.createElement(AccountBookOutlined),
    items: [
      { label: '物料对账', path: paths.materialReconciliation, icon: React.createElement(AccountBookOutlined) },
      { label: '成品结算', path: paths.shipmentReconciliation, icon: React.createElement(AccountBookOutlined) },
      { label: '审批付款', path: paths.paymentApproval, icon: React.createElement(AccountBookOutlined) },
      { label: '人员工序统计', path: paths.payrollOperatorSummary, icon: React.createElement(AccountBookOutlined) },
    ],
  },
  {
    title: '系统设置',
    key: 'system',
    icon: React.createElement(SafetyCertificateOutlined),
    items: [
      { label: '个人中心', path: paths.profile, icon: React.createElement(SettingOutlined) },
      { label: '人员管理', path: paths.user, icon: React.createElement(TeamOutlined) },
      { label: '角色管理', path: paths.role, icon: React.createElement(UserSwitchOutlined) },
      { label: '加工厂管理', path: paths.factory, icon: React.createElement(DatabaseOutlined) },
      { label: '登录日志', path: paths.loginLog, icon: React.createElement(FileSearchOutlined) },
    ],
  },
];

export const routeToPermissionCode: Record<string, string> = {
  [paths.dashboard]: permissionCodes.dashboard,
  [paths.styleInfoList]: permissionCodes.styleInfo,
  [paths.orderManagementList]: permissionCodes.orderManagement,
  [paths.dataCenter]: permissionCodes.dataCenter,
  [paths.templateCenter]: permissionCodes.templateCenter,

  [paths.productionList]: permissionCodes.productionList,
  [paths.materialPurchase]: permissionCodes.materialPurchase,
  [paths.cutting]: permissionCodes.cutting,
  [paths.progressDetail]: permissionCodes.progress,
  [paths.warehousing]: permissionCodes.warehousing,

  [paths.materialReconciliation]: permissionCodes.materialRecon,
  [paths.shipmentReconciliation]: permissionCodes.shipmentRecon,
  [paths.paymentApproval]: permissionCodes.paymentApproval,

  [paths.user]: permissionCodes.user,
  [paths.role]: permissionCodes.role,
  [paths.factory]: permissionCodes.factory,
  [paths.loginLog]: permissionCodes.loginLog,
};

const normalizePath = (p: string) => String(p || '').split('?')[0];

export const resolvePermissionCode = (pathname: string): string | undefined => {
  const current = normalizePath(pathname);
  if (!current) return undefined;
  if (routeToPermissionCode[current]) return routeToPermissionCode[current];

  let best: { prefix: string; code: string } | null = null;
  for (const [prefix, code] of Object.entries(routeToPermissionCode)) {
    if (!prefix) continue;
    if (current.startsWith(prefix + '/')) {
      if (!best || prefix.length > best.prefix.length) best = { prefix, code };
    }
  }
  return best?.code;
};
