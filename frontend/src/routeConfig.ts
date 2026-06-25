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
  DeleteOutlined,
  DollarOutlined,
  EnvironmentOutlined,
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
  FireOutlined,
  RadarChartOutlined,
  AuditOutlined,
  ShopOutlined,
  TagOutlined,
  ProfileOutlined,
} from '@ant-design/icons';

export const paths = {
  root: '/',
  login: '/login',
  register: '/register',

  dashboard: '/dashboard',

  styleInfoList: '/style-info',
  styleInfoNew: '/style-info/new',
  styleInfoDetail: '/style-info/:id',
  orderManagementList: '/order-management',

  dataCenter: '/data-center',
  templateCenter: '/basic/template-center',
  maintenanceCenter: '/basic/maintenance-center',
  patternRevision: '/basic/pattern-revision',

  productionList: '/production',
  materialPurchase: '/production/material',
  materialPurchaseDetail: '/production/material/:styleNo',
  productionPartners: '/production/partners',
  cutting: '/production/cutting',
  cuttingTask: '/production/cutting/task/:orderNo',
  progressDetail: '/production/progress-detail',

  externalFactory: '/production/external-factory',
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
  employeeAdvance: '/finance/employee-advance',
  wagePayment: '/finance/wage-payment',
  ecSalesRevenue: '/finance/ec-revenue',
  financeTaxExport: '/finance/tax-export',
  orderWasteAnalysis: '/finance/order-waste-analysis',
  financeDashboard: '/finance/dashboard',

  materialInventory: '/warehouse/material',
  materialDatabase: '/warehouse/material-database',
  finishedInventory: '/warehouse/finished',
  sampleInventory: '/warehouse/sample',
  ecommerceOrders: '/warehouse/ecommerce',
  inventoryCheck: '/warehouse/inventory-check',
  labelPrint: '/warehouse/label-print',
  productInfo: '/warehouse/product-info',
  warehouseLocationMap: '/warehouse/location-map',
  profile: '/system/profile',
  user: '/system/user',
  userApproval: '/system/user-approval',
  role: '/system/role',
  organization: '/system/organization',
  partnerManagement: '/system/partner-management',
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
  orphanData: '/system/orphan-data',
  ecommerceCenter: '/ecommerce/center',
  ecommercePlatform: '/ecommerce/platform',
  cockpit: '/cockpit',
  cockpitTrace: '/cockpit/agent-traces',
  intelligenceCenter: '/intelligence/center',
  aiAgentTraceCenter: '/intelligence/agent-traces',
  platformDashboard: '/intelligence/platform-dashboard',
  crm: '/crm',
  crmReceivables: '/crm/receivables',
  selectionBatch: '/selection',
} as const;

// ─────────────────────────────────────────────────────────────
// AI助手页面元信息（统一管理页面标签 + 快捷建议）
// ─────────────────────────────────────────────────────────────

export interface PageMeta {
  label: string;
  suggestions?: string[];
}

const GENERAL_SUGGESTIONS = [
  '📄 今日日报',
  '📊 本周周报',
  '📈 本月月报',
  '🔍 检测今日异常',
  '🚨 查看紧急预警',
];

const pageMetaMap: Record<string, PageMeta> = {
  // ── 生产管理 ──
  [paths.productionList]: {
    label: '生产管理模块',
    suggestions: [
      '🏭 查看今日生产进度',
      '📅 预测订单交期',
      '🔍 检测生产异常',
      '📊 排产建议',
      '⚡ 紧急订单有哪些',
      '📉 逾期风险分析',
    ],
  },
  '/production/list': {
    label: '生产订单列表',
    suggestions: [
      '🔍 查找逾期订单',
      '📋 批量导出今日订单',
      '⚡ 标记紧急订单',
      '📊 按状态分组查看',
    ],
  },
  '/production/detail': { label: '生产订单详情' },
  '/production/progress': {
    label: '工序跟进',
    suggestions: [
      '📈 当前工序进度怎样',
      '⚠️ 哪些工序停滞了',
      '🔮 预计什么时候完成',
      '📊 工序效率分析',
    ],
  },
  [paths.cutting]: {
    label: '裁剪管理',
    suggestions: [
      '✂️ 查看裁剪计划',
      '📦 裁剪完成多少了',
      '⚠️ 裁剪异常提醒',
      '📊 裁剪效率统计',
    ],
  },
  '/production/purchase': {
    label: '物料采购',
    suggestions: [
      '🛒 待采购物料有哪些',
      '📦 采购到货情况',
      '⚠️ 物料短缺预警',
      '📊 采购成本分析',
    ],
  },
  [paths.warehousing]: {
    label: '成品入库',
    suggestions: [
      '📦 今日入库多少',
      '🔍 入库异常检测',
      '📊 入库效率统计',
      '⚠️ 质检合格率怎样',
    ],
  },
  '/production/inspection': { label: '质检管理' },

  // ── 款式样衣 ──
  [paths.styleInfoList]: {
    label: '款式样衣管理',
    suggestions: [
      '✂️ 分析这款样衣工序',
      '💰 报价建议',
      '📋 BOM清单检查',
      '🏭 推荐工厂',
      '📊 开发进度如何',
    ],
  },
  '/style-info/list': {
    label: '款式列表',
    suggestions: [
      '🔍 按状态筛选款式',
      '📋 批量操作选中款式',
      '⚠️ 逾期开发提醒',
      '📊 款式完成率',
    ],
  },
  '/style-info/detail': { label: '款式详情' },
  '/style-info/sample': {
    label: '样衣开发',
    suggestions: [
      '✂️ 样衣开发进度',
      '📋 待确认工序',
      '⚠️ 开发逾期提醒',
      '📊 样衣完成率',
    ],
  },

  // ── 财务管理 ──
  '/finance': {
    label: '财务管理',
    suggestions: [
      '💰 工资成本分析',
      '📊 对账异常检测',
      '📈 利润估算',
      '🧾 费用报销统计',
      '💵 本月支出多少',
    ],
  },
  '/finance/reconciliation': {
    label: '对账管理',
    suggestions: [
      '📋 待对账明细',
      '⚠️ 对账异常提醒',
      '💵 已对账金额',
      '📊 对账完成率',
    ],
  },
  '/finance/wage': {
    label: '工资结算',
    suggestions: [
      '💰 工资结算情况',
      '📋 待结算人员',
      '⚠️ 结算异常提醒',
      '📊 计件统计',
    ],
  },
  '/finance/expense': { label: '费用报销' },

  // ── 仓库管理 ──
  '/warehouse': {
    label: '仓库管理',
    suggestions: [
      '📦 库存预警',
      '🔍 物料短缺检测',
      '📊 入库统计',
      '🏭 供应商评分',
      '⚠️ 库存不足提醒',
    ],
  },
  '/warehouse/inventory': {
    label: '库存管理',
    suggestions: [
      '📦 库存余量查询',
      '⚠️ 库存预警提醒',
      '📋 呆滞物料',
      '📊 库存周转率',
    ],
  },
  [paths.materialInventory]: {
    label: '物料库',
    suggestions: [
      '🧵 面料库存情况',
      '📦 辅料库存预警',
      '⚠️ 短缺物料提醒',
      '📊 物料使用统计',
    ],
  },
  [paths.finishedInventory]: {
    label: '成品库存',
    suggestions: [
      '📦 成品库存情况',
      '🚚 待发货订单',
      '⚠️ 库存积压提醒',
      '📊 成品周转率',
    ],
  },
  [paths.sampleInventory]: { label: '样衣库存' },
  '/warehouse/check': {
    label: '库存盘点',
    suggestions: [
      '📋 盘点任务',
      '⚠️ 盘点差异提醒',
      '📊 盘点完成率',
      '📦 差异明细',
    ],
  },

  // ── 系统管理 ──
  '/system': {
    label: '系统管理',
    suggestions: [
      '🏭 供应商管理建议',
      '📊 工厂效率排行',
      '👥 工人技能分析',
      '⚙️ 系统健康检查',
    ],
  },
  [paths.user]: { label: '用户管理' },
  [paths.role]: { label: '角色权限' },
  [paths.tenantManagement]: { label: '租户管理' },
  '/system/log': { label: '系统日志' },

  // ── CRM ──
  [paths.crm]: {
    label: '客户关系管理',
    suggestions: [
      '📊 客户订单分析',
      '💰 应收账款概览',
      '📈 客户趋势预测',
      '🔍 逾期订单提醒',
    ],
  },
  '/crm/receivable': {
    label: '应收管理',
    suggestions: [
      '💰 应收金额汇总',
      '⚠️ 逾期应收提醒',
      '📊 回款进度',
      '📋 客户欠款明细',
    ],
  },

  // ── 智能决策中心 ──
  [paths.cockpit]: {
    label: '智能决策中心',
    suggestions: [
      '🧠 AI大脑总快照',
      '📊 智能运营报告',
      '🔍 异常工单追踪',
      '📈 学习效果评估',
      '🚨 风险预警汇总',
    ],
  },
  '/cockpit/trace': { label: '执行轨迹' },

  // ── 数据驾驶舱 ──
  [paths.dashboard]: { label: '数据驾驶舱' },
  '/dashboard/main': { label: '主仪表盘' },
  '/dashboard/sample': { label: '样衣进度' },

  // ── 选品中心 ──
  [paths.selectionBatch]: {
    label: '选品中心',
    suggestions: [
      '🛍️ 今日选品动态',
      '📈 选品转化分析',
      '⚠️ 爆款预警',
      '📊 选品成功率',
    ],
  },

  // ── 电商运营 ──
  '/ecommerce': {
    label: '电商运营',
    suggestions: [
      '📦 电商订单处理',
      '🚚 发货状态跟踪',
      '⚠️ 异常订单提醒',
      '📊 订单转化统计',
    ],
  },
  '/ecommerce/order': { label: '电商订单' },

  // ── 智能中心 ──
  '/intelligence': {
    label: '智能中心',
    suggestions: [
      '🤖 小云AI能力中心',
      '📊 AI执行轨迹',
      '🔍 AI建议采纳率',
      '⚙️ AI模型配置',
    ],
  },
  [paths.intelligenceCenter]: { label: 'AI功能中心' },
  '/intelligence/trace': { label: '智能执行记录' },
};

// 按路径长度降序排序，确保更具体的路径优先匹配（修复 /production 误匹配 /production/cutting 的问题）
const sortedPageMeta = Object.entries(pageMetaMap).sort(
  (a, b) => b[0].length - a[0].length,
);

export function getPageMeta(pathname: string): PageMeta | null {
  for (const [path, meta] of sortedPageMeta) {
    if (pathname.startsWith(path)) {
      return meta;
    }
  }
  return null;
}

export function getPageLabel(pathname: string): string {
  return getPageMeta(pathname)?.label ?? '';
}

export function getPageSuggestions(pathname: string): string[] {
  return getPageMeta(pathname)?.suggestions ?? GENERAL_SUGGESTIONS;
}

export const permissionCodes = {
  dashboard: 'MENU_DASHBOARD',
  styleInfo: 'MENU_STYLE_INFO',
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
  employeeAdvance: 'MENU_EMPLOYEE_ADVANCE',
  wagePayment: 'MENU_PAYMENT_APPROVAL',

  materialInventory: 'MENU_MATERIAL_INVENTORY',
  materialDatabase: 'MENU_MATERIAL_DATABASE',
  finishedInventory: 'MENU_FINISHED_INVENTORY',
  sampleInventory: 'MENU_SAMPLE_INVENTORY',
  ecommerceOrders: 'MENU_FINISHED_INVENTORY',
  inventoryCheck: 'MENU_FINISHED_INVENTORY',
  labelPrint: 'MENU_LABEL_PRINT',
  productInfo: 'MENU_PRODUCT_INFO',
  warehouseLocationMap: 'MENU_WAREHOUSE_LOCATION_MAP',
  user: 'MENU_USER',
  userApproval: 'MENU_USER_APPROVAL',
  role: 'MENU_ROLE',
  organization: 'MENU_FACTORY',
  partnerManagement: 'MENU_FACTORY',
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
  ecommerceCenter: 'MENU_ECOMMERCE',
  ecommercePlatform: 'MENU_ECOMMERCE',
  intelligenceCenter: 'MENU_INTELLIGENCE_CENTER', // 智能运营中心独立权限码（full_admin专用）
  systemIssues: 'MENU_CUSTOMER', // 超管专属，复用权限码
  financeTaxExport: 'MENU_FINANCE_EXPORT',
  orderWasteAnalysis: 'MENU_FINANCE_EXPORT',
  financeDashboard: 'MENU_FINISHED_SETTLEMENT',
  crm: 'MENU_CRM',
  crmReceivables: 'MENU_CRM',
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
      { label: '资料单价', path: paths.maintenanceCenter, icon: React.createElement(DatabaseOutlined) },
      { label: '样衣库存', path: paths.sampleInventory, icon: React.createElement(FileTextOutlined) },
      { label: '下单管理', path: paths.orderManagementList, icon: React.createElement(FileTextOutlined) },
    ],
  },
  {
    title: '物料管理',
    key: 'procurement',
    icon: React.createElement(ShoppingCartOutlined),
    items: [
      { label: '物料采购', path: paths.materialPurchase, icon: React.createElement(ShoppingCartOutlined) },
      { label: '物料出入库', path: paths.materialInventory, icon: React.createElement(InboxOutlined) },
      { label: '物料新增', path: paths.materialDatabase, icon: React.createElement(DatabaseOutlined) },
    ],
  },
  {
    title: '生产管理',
    key: 'production',
    icon: React.createElement(BuildOutlined),
    items: [
      { label: '我的订单', path: paths.productionList, icon: React.createElement(BuildOutlined) },
      { label: '裁剪管理', path: paths.cutting, icon: React.createElement(ScissorOutlined) },
      { label: '工序跟进', path: paths.progressDetail, icon: React.createElement(FileSearchOutlined) },
      { label: '外发工厂', path: paths.externalFactory, icon: React.createElement(ThunderboltOutlined) },
      { label: '质检入库', path: paths.warehousing, icon: React.createElement(InboxOutlined) },
    ],
  },
  {
    title: '供应商管理',
    key: 'supplierManagement',
    icon: React.createElement(TeamOutlined),
    path: paths.productionPartners,
  },
  {
    title: '成品管理',
    key: 'warehouse',
    icon: React.createElement(InboxOutlined),
    items: [
      { label: '成品出入库', path: paths.finishedInventory, icon: React.createElement(InboxOutlined) },
      { label: '成品资料', path: paths.productInfo, icon: React.createElement(ProfileOutlined) },
      { label: '标签打印', path: paths.labelPrint, icon: React.createElement(TagOutlined) },
      { label: '库存盘点', path: paths.inventoryCheck, icon: React.createElement(AuditOutlined) },
      { label: '库位地图', path: paths.warehouseLocationMap, icon: React.createElement(EnvironmentOutlined) },
    ],
  },
  {
    title: '电商运营',
    key: 'ecommerce',
    icon: React.createElement(ShopOutlined),
    items: [
      { label: '平台总览', path: paths.ecommerceCenter, icon: React.createElement(ShopOutlined) },
      { label: '电商订单', path: paths.ecommerceOrders, icon: React.createElement(ShoppingCartOutlined) },
      { label: 'EC销售收入', path: paths.ecSalesRevenue, icon: React.createElement(AccountBookOutlined) },
    ],
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
      // ========== 总览 ==========
      { label: '财务总览', path: paths.financeDashboard, icon: React.createElement(DashboardOutlined) },
      // ========== 内部结算 ==========
      { label: '工资结算', path: paths.payrollOperatorSummary, icon: React.createElement(AccountBookOutlined) },
      // ========== 外部结算 ==========
      { label: '外发结算', path: paths.financeCenter, icon: React.createElement(ShopOutlined) },
      { label: '物料对账', path: paths.materialReconciliation, icon: React.createElement(FileTextOutlined) },
      // ========== 收付款 ==========
      { label: '收付款中心', path: paths.wagePayment, icon: React.createElement(DollarOutlined) },
      // ========== 财税工具 ==========
      { label: '财税工具', path: paths.financeTaxExport, icon: React.createElement(DollarOutlined) },
    ],
  },
  {
    title: '系统设置',
    key: 'system',
    icon: React.createElement(SafetyCertificateOutlined),
    items: [
      { label: '个人中心', path: paths.profile, icon: React.createElement(SettingOutlined) },
      { label: '人员管理', path: paths.user, icon: React.createElement(TeamOutlined) },
      { label: '岗位管理', path: paths.role, icon: React.createElement(UserSwitchOutlined) },
      { label: '组织架构', path: paths.organization, icon: React.createElement(TeamOutlined) },
      { label: '合作企业管理', path: paths.partnerManagement, icon: React.createElement(TeamOutlined) },
    ],
  },
  {
    title: '工具',
    key: 'tools',
    icon: React.createElement(SettingOutlined),
    items: [
      { label: '数据导入', path: paths.dataImport, icon: React.createElement(FileTextOutlined) },
      { label: '字典管理', path: paths.dict, icon: React.createElement(BookOutlined) },
      { label: '系统日志', path: paths.systemLogs, icon: React.createElement(FileSearchOutlined) },
      { label: '系统教学', path: paths.tutorial, icon: React.createElement(BookOutlined) },
      { label: '孤立数据', path: paths.orphanData, icon: React.createElement(DeleteOutlined) },
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
    items: [
      { label: '智能运营中心', path: paths.intelligenceCenter, icon: React.createElement(ThunderboltOutlined) },
      { label: '数据看板', path: paths.cockpit, icon: React.createElement(RadarChartOutlined) },
    ],
  },
];

export const routeToPermissionCode: Record<string, string> = {
  [paths.dashboard]: permissionCodes.dashboard,
  [paths.styleInfoList]: permissionCodes.styleInfo,
  [paths.orderManagementList]: permissionCodes.orderManagement,
  [paths.dataCenter]: permissionCodes.dataCenter,
  [paths.templateCenter]: permissionCodes.templateCenter,
  [paths.maintenanceCenter]: permissionCodes.dataCenter,

  [paths.materialInventory]: permissionCodes.materialInventory,
  [paths.materialDatabase]: permissionCodes.materialDatabase,
  [paths.finishedInventory]: permissionCodes.finishedInventory,
  [paths.sampleInventory]: permissionCodes.sampleInventory,
  [paths.ecommerceOrders]: permissionCodes.ecommerceOrders,
  [paths.inventoryCheck]: permissionCodes.inventoryCheck,
  [paths.labelPrint]: permissionCodes.labelPrint,
  [paths.productInfo]: permissionCodes.productInfo,
  [paths.warehouseLocationMap]: permissionCodes.warehouseLocationMap,


  [paths.productionList]: permissionCodes.productionList,
  [paths.materialPurchase]: permissionCodes.materialPurchase,
  [paths.productionPartners]: permissionCodes.factory,
  [paths.cutting]: permissionCodes.cutting,
  [paths.materialPicking]: permissionCodes.materialPicking,
  [paths.progressDetail]: permissionCodes.progress,
  [paths.externalFactory]: permissionCodes.progress,
  [paths.orderFlow]: permissionCodes.progress,
  [paths.orderTransfer]: permissionCodes.orderTransfer,
  [paths.warehousing]: permissionCodes.warehousing,

  [paths.patternRevision]: permissionCodes.patternRevision,

  [paths.materialReconciliation]: permissionCodes.materialRecon,
  [paths.payrollOperatorSummary]: permissionCodes.financeCenter, // 工资结算汇总，复用成品结算权限（MENU_FINISHED_SETTLEMENT）
  [paths.financeCenter]: permissionCodes.financeCenter,
  [paths.expenseReimbursement]: permissionCodes.expenseReimbursement,
  [paths.employeeAdvance]: permissionCodes.employeeAdvance,
  [paths.wagePayment]: permissionCodes.wagePayment,
  [paths.user]: permissionCodes.user,
  [paths.userApproval]: permissionCodes.userApproval,
  [paths.role]: permissionCodes.role,
  [paths.organization]: permissionCodes.organization,
  [paths.partnerManagement]: permissionCodes.partnerManagement,
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
  [paths.ecommerceCenter]: permissionCodes.ecommerceCenter,
  [paths.ecommercePlatform]: permissionCodes.ecommercePlatform,
  [paths.cockpit]: permissionCodes.intelligenceCenter,
  [paths.cockpitTrace]: permissionCodes.intelligenceCenter,
  [paths.intelligenceCenter]: permissionCodes.intelligenceCenter,
  [paths.aiAgentTraceCenter]: permissionCodes.intelligenceCenter,
  [paths.systemIssues]: permissionCodes.systemIssues,
  // financeTaxExport: 标准格式免费开放，有财务权限的用户均可访问；金蝶/用友格式在页面内做付费拦截
  [paths.financeTaxExport]: permissionCodes.financeTaxExport,       // 财税导出 → MENU_FINANCE_EXPORT
  [paths.ecSalesRevenue]: permissionCodes.financeTaxExport,         // EC销售收入 → MENU_FINANCE_EXPORT
  [paths.orderWasteAnalysis]: permissionCodes.orderWasteAnalysis,   // 订单损耗分析 → MENU_FINANCE_EXPORT
  [paths.financeDashboard]: permissionCodes.financeDashboard,       // 财务总览 → MENU_FINISHED_SETTLEMENT
  [paths.crm]: permissionCodes.crm,
  [paths.crmReceivables]: permissionCodes.crmReceivables,
  [paths.selectionBatch]: permissionCodes.selection,
  [paths.profile]: 'PUBLIC',
  [paths.orphanData]: permissionCodes.systemIssues,
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

  return best ? best.code : undefined;
};

/**
 * 智能获取用户的默认主页（防止白屏死循环）
 * 优先级：超级管理员/工厂模式 -> Dashboard -> 根据权限按顺序分配 -> Profile保底
 */
export const getDefaultRouteForUser = (user: any): string => {
  if (!user) return paths.login;
  if (user.isSuperAdmin) return paths.dashboard;

  // 工厂账号专属默认页
  if (user.factoryId) return paths.productionList;

  // 普通账号：如果拥有 dashboard 权限，优先去 dashboard
  const perms = user.permissions || [];
  if (perms.includes('all') || perms.includes(permissionCodes.dashboard)) {
    return paths.dashboard;
  }

  // 如果没有 dashboard 权限，按优先级智能分配第一个有权限的菜单
  const fallbackPriority = [
    { code: permissionCodes.productionList, path: paths.productionList },
    { code: permissionCodes.styleInfo, path: paths.styleInfoList },
    { code: permissionCodes.orderManagement, path: paths.orderManagementList },
    { code: permissionCodes.materialInventory, path: paths.materialInventory },
    { code: permissionCodes.crm, path: paths.crm },
    { code: permissionCodes.financeCenter, path: paths.financeCenter },
  ];

  for (const item of fallbackPriority) {
    if (perms.includes(item.code)) {
      return item.path;
    }
  }

  // 实在没有任何业务菜单权限，保底去个人中心（所有人都有权限看自己）
  return paths.profile;
};
