import React from 'react';
import type { ReactNode } from 'react';
import {
  AccountBookOutlined,
  ApiOutlined,
  AppstoreOutlined,
  BookOutlined,
  BuildOutlined,
  CrownOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  ShoppingCartOutlined,
  ScissorOutlined,
  ThunderboltOutlined,
  AuditOutlined,
  FireOutlined,
} from '@ant-design/icons';

export const paths = {
  root: '/',
  login: '/login',

  dashboard: '/dashboard',

  styleInfoList: '/style-info',
  styleInfoNew: '/style-info/new',
  styleInfoDetail: '/style-info/:id',
  patternProduction: '/pattern-production',

  orderManagementList: '/order-management',
  orderManagementDetail: '/order-management/:styleNo',

  dataCenter: '/data-center',
  templateCenter: '/basic/template-center',
  patternRevision: '/basic/pattern-revision',

  productionList: '/production',
  materialPurchase: '/production/material',
  materialPurchaseDetail: '/production/material/:styleNo',
  cutting: '/production/cutting',
  cuttingTask: '/production/cutting/task/:orderNo',
  progressDetail: '/production/progress-detail',
  orderFlow: '/production/order-flow',
  warehousing: '/production/warehousing',
  warehousingDetail: '/production/warehousing/detail/:warehousingNo',
  warehousingInspect: '/production/warehousing/inspect/:orderId',
  orderTransfer: '/production/transfer',
  materialPicking: '/production/picking',

  materialReconciliation: '/finance/material-reconciliation',
  payrollOperatorSummary: '/finance/payroll-operator-summary',
  financeCenter: '/finance/center',
  expenseReimbursement: '/finance/expense-reimbursement',
  wagePayment: '/finance/wage-payment',
  ecSalesRevenue: '/finance/ec-revenue',
  financeTaxExport: '/finance/tax-export',

  warehouseDashboard: '/warehouse/dashboard',
  materialInventory: '/warehouse/material',
  materialDatabase: '/warehouse/material-database',
  finishedInventory: '/warehouse/finished',
  sampleInventory: '/warehouse/sample',
  ecommerceOrders: '/warehouse/ecommerce',

  profile: '/system/profile',
  user: '/system/user',
  userApproval: '/system/user-approval',
  role: '/system/role',
  organization: '/system/organization',
  factory: '/system/factory',
  factoryWorkers: '/system/factory-workers',
  loginLog: '/system/login-log',
  systemLogs: '/system/logs',
  dict: '/system/dict',
  tutorial: '/system/tutorial',
  tenantManagement: '/system/tenant',
  customerManagement: '/system/customer',
  appStore: '/system/app-store',
  dataImport: '/system/data-import',
  systemIssues: '/system/issues',
  approvalCenter: '/system/approval-center',
  integrationCenter: '/integration/center',
  intelligenceCenter: '/intelligence/center',
  crm: '/crm',
  crmReceivables: '/crm/receivables',
  procurement: '/procurement',
  procurementDetail: '/procurement/detail/:id',
  selectionBatch: '/selection',
} as const;

export const permissionCodes = {
  dashboard: 'MENU_DASHBOARD',
  styleInfo: 'MENU_STYLE_INFO',
  patternProduction: 'MENU_PATTERN_PRODUCTION',
  orderManagement: 'MENU_ORDER_MANAGEMENT',
  dataCenter: 'MENU_DATA_CENTER',
  templateCenter: 'MENU_TEMPLATE_CENTER',
  patternRevision: 'MENU_PATTERN_REVISION',

  productionList: 'MENU_PRODUCTION_LIST',
  materialPurchase: 'MENU_MATERIAL_PURCHASE',
  cutting: 'MENU_CUTTING',
  progress: 'MENU_PROGRESS',
  materialPicking: 'MENU_MATERIAL_PICKING',
  warehousing: 'MENU_WAREHOUSING',
  orderTransfer: 'MENU_ORDER_TRANSFER',

  materialRecon: 'MENU_MATERIAL_RECON',
  financeCenter: 'MENU_FINISHED_SETTLEMENT',
  expenseReimbursement: 'MENU_EXPENSE_REIMBURSEMENT',
  wagePayment: 'MENU_PAYMENT_APPROVAL',

  warehouseDashboard: 'MENU_WAREHOUSE_DASHBOARD',
  materialInventory: 'MENU_MATERIAL_INVENTORY',
  materialDatabase: 'MENU_MATERIAL_DATABASE',
  finishedInventory: 'MENU_FINISHED_INVENTORY',
  sampleInventory: 'MENU_SAMPLE_INVENTORY',
  ecommerceOrders: 'MENU_FINISHED_INVENTORY', // 复用成品库权限，平台订单均可查看

  user: 'MENU_USER',
  userApproval: 'MENU_USER_APPROVAL',
  approvalCenter: 'MENU_USER_APPROVAL',
  role: 'MENU_ROLE',
  organization: 'MENU_FACTORY',
  factory: 'MENU_FACTORY',
  factoryWorkers: 'MENU_FACTORY', // 复用供应商管理权限，无需新增 DB 迁移
  loginLog: 'MENU_LOGIN_LOG',
  systemLogs: 'MENU_LOGIN_LOG', // 使用相同的权限码，兼容旧数据
  dict: 'MENU_DICT',
  tutorial: 'MENU_TUTORIAL',
  tenantManagement: 'MENU_TENANT_APP',
  customerManagement: 'MENU_CUSTOMER',
  appStore: 'MENU_APP_STORE_VIEW',
  dataImport: 'MENU_DATA_IMPORT',
  integrationCenter: 'MENU_INTEGRATION',
  intelligenceCenter: 'MENU_DASHBOARD', // 智能中心复用仪表盘权限码
  systemIssues: 'MENU_CUSTOMER', // 超管专属，复用权限码
  financeTaxExport: 'MENU_FINANCE_EXPORT',
  crm: 'MENU_CRM',
  crmReceivables: 'MENU_CRM',
  procurement: 'MENU_PROCUREMENT',
  selection: 'MENU_SELECTION',
} as const;

export type MenuItem = {
  label: string;
  path: string;
  icon?: ReactNode;
  superAdminOnly?: boolean;
};

export type MenuSection = {
  title: string;
  key: string;
  icon?: ReactNode;
  items?: MenuItem[];
  path?: string;
  superAdminOnly?: boolean;
};

export const menuConfig: MenuSection[] = [
  {
    title: '仪表盘',
    key: 'dashboard',
    icon: React.createElement(DashboardOutlined),
    path: paths.dashboard,
  },
  {
    title: '选品中心',
    key: 'selection',
    icon: React.createElement(FireOutlined),
    path: paths.selectionBatch,
  },
  {
    title: '样衣管理',
    key: 'basic',
    icon: React.createElement(AppstoreOutlined),
    items: [
      { label: '样衣开发', path: paths.styleInfoList, icon: React.createElement(FileTextOutlined) },
      { label: '样板生产', path: paths.patternProduction, icon: React.createElement(ScissorOutlined) },
      { label: '资料中心', path: paths.dataCenter, icon: React.createElement(DatabaseOutlined) },
      { label: '单价维护', path: paths.templateCenter, icon: React.createElement(BookOutlined) },
      { label: '下单管理', path: paths.orderManagementList, icon: React.createElement(FileTextOutlined) },
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
      { label: '物料资料库', path: paths.materialDatabase, icon: React.createElement(DatabaseOutlined) },
      { label: '成品进销存', path: paths.finishedInventory, icon: React.createElement(InboxOutlined) },
      { label: '样衣出入库', path: paths.sampleInventory, icon: React.createElement(FileTextOutlined) },      { label: '电商订单', path: paths.ecommerceOrders, icon: React.createElement(ApiOutlined) },    ],
  },
  {
    title: '供应商采购',
    key: 'procurement',
    icon: React.createElement(ShoppingCartOutlined),
    path: paths.procurement,
  },
  {
    title: 'CRM客户管理',
    key: 'crm',
    icon: React.createElement(TeamOutlined),
    items: [
      { label: '客户档案', path: paths.crm, icon: React.createElement(TeamOutlined) },
      { label: '应收账款', path: paths.crmReceivables, icon: React.createElement(DollarOutlined) },
    ],
  },
  {
    title: '财务管理',
    key: 'finance',
    icon: React.createElement(AccountBookOutlined),
    items: [
      { label: '物料对账', path: paths.materialReconciliation, icon: React.createElement(AccountBookOutlined) },
      { label: '工资结算(内)', path: paths.payrollOperatorSummary, icon: React.createElement(AccountBookOutlined) },
      { label: '订单结算(外)', path: paths.financeCenter, icon: React.createElement(AccountBookOutlined) },
      { label: '费用报销', path: paths.expenseReimbursement, icon: React.createElement(AccountBookOutlined) },
      { label: '付款中心', path: paths.wagePayment, icon: React.createElement(DollarOutlined) },
      { label: 'EC销售收入', path: paths.ecSalesRevenue, icon: React.createElement(AccountBookOutlined) },
      { label: '财税导出', path: paths.financeTaxExport, icon: React.createElement(DollarOutlined) },
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
      { label: '组织架构', path: paths.organization, icon: React.createElement(TeamOutlined) },
      { label: '审批中心', path: paths.approvalCenter, icon: React.createElement(AuditOutlined) },
      { label: '供应商管理', path: paths.factory, icon: React.createElement(DatabaseOutlined) },
      { label: '字典管理', path: paths.dict, icon: React.createElement(BookOutlined) },
      { label: '系统日志', path: paths.systemLogs, icon: React.createElement(FileSearchOutlined) },
      { label: '系统教学', path: paths.tutorial, icon: React.createElement(BookOutlined) },
      { label: '数据导入', path: paths.dataImport, icon: React.createElement(FileTextOutlined) },
    ],
  },
  {
    title: '应用商店',
    key: 'appStore',
    icon: React.createElement(ShoppingCartOutlined),
    path: paths.appStore,
  },
  {
    title: '客户管理',
    key: 'customer',
    icon: React.createElement(CrownOutlined),
    path: paths.customerManagement,
    superAdminOnly: true,
  },
  {
    title: 'API对接管理',
    key: 'tenant',
    icon: React.createElement(ApiOutlined),
    path: paths.tenantManagement,
  },
  {
    title: '智能运营中心',
    key: 'intelligenceCenter',
    icon: React.createElement(ThunderboltOutlined),
    path: paths.intelligenceCenter,
  },
  {
    title: '集成对接中心',
    key: 'integrationCenter',
    icon: React.createElement(ApiOutlined),
    path: paths.integrationCenter,
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
  [paths.ecommerceOrders]: permissionCodes.ecommerceOrders,


  [paths.productionList]: permissionCodes.productionList,
  [paths.materialPurchase]: permissionCodes.materialPurchase,
  [paths.cutting]: permissionCodes.cutting,
  [paths.materialPicking]: permissionCodes.materialPicking,
  [paths.progressDetail]: permissionCodes.progress,
  [paths.warehousing]: permissionCodes.warehousing,

  [paths.materialReconciliation]: permissionCodes.materialRecon,
  [paths.payrollOperatorSummary]: permissionCodes.financeCenter, // 工资结算汇总，复用成品结算权限（MENU_FINISHED_SETTLEMENT）
  [paths.financeCenter]: permissionCodes.financeCenter,
  [paths.expenseReimbursement]: permissionCodes.expenseReimbursement,
  [paths.wagePayment]: permissionCodes.wagePayment,
  [paths.user]: permissionCodes.user,
  [paths.userApproval]: permissionCodes.userApproval,
  [paths.approvalCenter]: permissionCodes.approvalCenter,
  [paths.role]: permissionCodes.role,
  [paths.factory]: permissionCodes.factory,
  [paths.factoryWorkers]: permissionCodes.factoryWorkers,
  [paths.loginLog]: permissionCodes.loginLog,
  [paths.systemLogs]: permissionCodes.systemLogs,
  [paths.dict]: permissionCodes.dict,
  [paths.tutorial]: permissionCodes.tutorial,
  [paths.tenantManagement]: permissionCodes.tenantManagement,
  [paths.customerManagement]: permissionCodes.customerManagement,
  [paths.appStore]: permissionCodes.appStore,
  [paths.dataImport]: permissionCodes.dataImport,
  [paths.integrationCenter]: permissionCodes.integrationCenter,
  [paths.intelligenceCenter]: permissionCodes.intelligenceCenter,
  [paths.systemIssues]: permissionCodes.systemIssues,
  // financeTaxExport: 标准格式免费开放，所有有财务权限的用户均可访问；金蝶/用友格式在页面内做付费拦截
  [paths.crm]: permissionCodes.crm,
  [paths.crmReceivables]: permissionCodes.crmReceivables,
  [paths.procurement]: permissionCodes.procurement,
  [paths.selectionBatch]: permissionCodes.selection,
};

/** 仅超级管理员可见/可访问的路径集合 */
export const superAdminOnlyPaths = new Set(
  menuConfig.filter((s) => s.superAdminOnly).map((s) => s.path).filter(Boolean) as string[]
);

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
