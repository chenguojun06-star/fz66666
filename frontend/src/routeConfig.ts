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
  patternProduction: '/pattern-production',

  orderManagementList: '/order-management',
  orderManagementDetail: '/order-management/:styleNo',

  dataCenter: '/data-center',
  templateCenter: '/basic/template-center',

  productionList: '/production',
  materialPurchase: '/production/material',
  materialPurchaseDetail: '/production/material/:orderNo',
  cutting: '/production/cutting',
  cuttingTask: '/production/cutting/task/:orderNo',
  progressDetail: '/production/progress-detail',
  orderFlow: '/production/order-flow',
  warehousing: '/production/warehousing',
  warehousingDetail: '/production/warehousing/detail/:warehousingNo',
  orderTransfer: '/production/transfer',

  materialReconciliation: '/finance/material-reconciliation',
  paymentApproval: '/finance/payment-approval',
  orderReconciliationApproval: '/finance/order-reconciliation-approval',
  payrollOperatorSummary: '/finance/payroll-operator-summary',
  financeCenter: '/finance/center',

  warehouseDashboard: '/warehouse/dashboard',
  materialInventory: '/warehouse/material',
  materialDatabase: '/warehouse/material-database',
  finishedInventory: '/warehouse/finished',
  sampleInventory: '/warehouse/sample',

  profile: '/system/profile',
  user: '/system/user',
  userApproval: '/system/user-approval',
  role: '/system/role',
  factory: '/system/factory',
  loginLog: '/system/login-log',
  dict: '/system/dict',
  tutorial: '/system/tutorial',
} as const;

export const permissionCodes = {
  dashboard: 'MENU_DASHBOARD',
  styleInfo: 'MENU_STYLE_INFO',
  patternProduction: 'MENU_PATTERN_PRODUCTION',
  orderManagement: 'MENU_ORDER_MANAGEMENT',
  dataCenter: 'MENU_DATA_CENTER',
  templateCenter: 'MENU_TEMPLATE_CENTER',

  productionList: 'MENU_PRODUCTION_LIST',
  materialPurchase: 'MENU_MATERIAL_PURCHASE',
  cutting: 'MENU_CUTTING',
  progress: 'MENU_PROGRESS',
  warehousing: 'MENU_WAREHOUSING',
  orderTransfer: 'MENU_ORDER_TRANSFER',

  materialRecon: 'MENU_MATERIAL_RECON',
  paymentApproval: 'MENU_PAYMENT_APPROVAL',
  orderReconciliationApproval: 'MENU_ORDER_RECON_APPROVAL',
  financeCenter: 'MENU_FINANCE_CENTER',

  warehouseDashboard: 'MENU_WAREHOUSE_DASHBOARD',
  materialInventory: 'MENU_MATERIAL_INVENTORY',
  materialDatabase: 'MENU_MATERIAL_DATABASE',
  finishedInventory: 'MENU_FINISHED_INVENTORY',
  sampleInventory: 'MENU_SAMPLE_INVENTORY',

  user: 'MENU_USER',
  userApproval: 'MENU_USER_APPROVAL',
  role: 'MENU_ROLE',
  factory: 'MENU_FACTORY',
  loginLog: 'MENU_LOGIN_LOG',
  dict: 'MENU_DICT',
  tutorial: 'MENU_TUTORIAL',
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
    title: '样衣管理',
    key: 'basic',
    icon: React.createElement(AppstoreOutlined),
    items: [
      { label: '样衣开发', path: paths.styleInfoList, icon: React.createElement(FileTextOutlined) },
      { label: '样板生产', path: paths.patternProduction, icon: React.createElement(ScissorOutlined) },
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
    title: '仓库管理',
    key: 'warehouse',
    icon: React.createElement(InboxOutlined),
    items: [
      { label: '数据看板', path: paths.warehouseDashboard, icon: React.createElement(DashboardOutlined) },
      { label: '面辅料进销存', path: paths.materialInventory, icon: React.createElement(InboxOutlined) },
      { label: '面辅料数据库', path: paths.materialDatabase, icon: React.createElement(DatabaseOutlined) },
      { label: '成品进销存', path: paths.finishedInventory, icon: React.createElement(InboxOutlined) },
      { label: '样衣出入库', path: paths.sampleInventory, icon: React.createElement(FileTextOutlined) },
    ],
  },
  {
    title: '财务管理',
    key: 'finance',
    icon: React.createElement(AccountBookOutlined),
    items: [
      { label: '物料对账', path: paths.materialReconciliation, icon: React.createElement(AccountBookOutlined) },
      { label: '工资审批', path: paths.paymentApproval, icon: React.createElement(AccountBookOutlined) },
      { label: '订单审批', path: paths.orderReconciliationApproval, icon: React.createElement(AccountBookOutlined) },
      { label: '工资结算', path: paths.payrollOperatorSummary, icon: React.createElement(AccountBookOutlined) },
      { label: '订单结算', path: paths.financeCenter, icon: React.createElement(AccountBookOutlined) },
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
      { label: '供应商管理', path: paths.factory, icon: React.createElement(DatabaseOutlined) },
      { label: '字典管理', path: paths.dict, icon: React.createElement(BookOutlined) },
      { label: '登录日志', path: paths.loginLog, icon: React.createElement(FileSearchOutlined) },
      { label: '系统教学', path: paths.tutorial, icon: React.createElement(BookOutlined) },
    ],
  },
];

export const routeToPermissionCode: Record<string, string> = {
  [paths.dashboard]: permissionCodes.dashboard,
  [paths.styleInfoList]: permissionCodes.styleInfo,
  [paths.patternProduction]: permissionCodes.patternProduction,
  [paths.orderManagementList]: permissionCodes.orderManagement,
  [paths.dataCenter]: permissionCodes.dataCenter,
  [paths.templateCenter]: permissionCodes.templateCenter,

  [paths.warehouseDashboard]: permissionCodes.warehouseDashboard,
  [paths.materialInventory]: permissionCodes.materialInventory,
  [paths.materialDatabase]: permissionCodes.materialDatabase,
  [paths.finishedInventory]: permissionCodes.finishedInventory,
  [paths.sampleInventory]: permissionCodes.sampleInventory,


  [paths.productionList]: permissionCodes.productionList,
  [paths.materialPurchase]: permissionCodes.materialPurchase,
  [paths.cutting]: permissionCodes.cutting,
  [paths.progressDetail]: permissionCodes.progress,
  [paths.warehousing]: permissionCodes.warehousing,

  [paths.materialReconciliation]: permissionCodes.materialRecon,
  [paths.paymentApproval]: permissionCodes.paymentApproval,
  [paths.orderReconciliationApproval]: permissionCodes.orderReconciliationApproval,
  [paths.financeCenter]: permissionCodes.financeCenter,
  [paths.user]: permissionCodes.user,
  [paths.userApproval]: permissionCodes.userApproval,
  [paths.role]: permissionCodes.role,
  [paths.factory]: permissionCodes.factory,
  [paths.loginLog]: permissionCodes.loginLog,
  [paths.dict]: permissionCodes.dict,
  [paths.tutorial]: permissionCodes.tutorial,
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
