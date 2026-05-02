export const BASIC_PRESET_MODULES = [
  '/dashboard', '/basic/template-center',
  '/finance/payroll-operator-summary', '/finance/wage-payment', '/finance/expense-reimbursement',
  '/system/profile', '/system/user', '/system/role', '/production/partners',
  '/system/dict', '/system/logs', '/system/tutorial', '/system/data-import',
];

export const MODULE_SECTIONS = [
  { key: 'dashboard', title: '仪表盘', paths: [{ path: '/dashboard', label: '仪表盘' }] },
  { key: 'selection', title: '选品中心', paths: [{ path: '/selection', label: '选品批次' }] },
  { key: 'basic', title: '样衣管理', paths: [
    { path: '/style-info', label: '样衣开发' },
    { path: '/basic/maintenance-center', label: '资料单价' },
    { path: '/warehouse/sample', label: '样衣库存' },
    { path: '/order-management', label: '下单管理' },
  ]},
  { key: 'procurement', title: '物料管理', paths: [
    { path: '/production/material', label: '物料采购' },
    { path: '/warehouse/material', label: '物料进销存' },
    { path: '/warehouse/material-database', label: '物料新增' },
  ]},
  { key: 'production', title: '生产管理', paths: [
    { path: '/production', label: '我的订单' },
    { path: '/production/cutting', label: '裁剪管理' },
    { path: '/production/progress-detail', label: '工序跟进' },
    { path: '/production/external-factory', label: '外发工厂' },
    { path: '/production/picking', label: '物料领用' },
    { path: '/production/warehousing', label: '质检入库' },
    { path: '/production/transfer', label: '订单转移' },
  ]},
  { key: 'supplierManagement', title: '供应商管理', paths: [
    { path: '/production/partners', label: '供应商管理' },
  ]},
  { key: 'warehouse', title: '成品管理', paths: [
    { path: '/warehouse/finished', label: '成品进销存' },
    { path: '/warehouse/ecommerce', label: '电商订单' },
  ]},
  { key: 'finance', title: '财务管理', paths: [
    { path: '/finance/material-reconciliation', label: '物料对账' },
    { path: '/finance/payroll-operator-summary', label: '工资结算(内)' },
    { path: '/finance/center', label: '订单结算(外)' },
    { path: '/finance/expense-reimbursement', label: '费用报销' },
    { path: '/finance/wage-payment', label: '收付款中心' },
    { path: '/finance/ec-revenue', label: 'EC销售收入' },
    { path: '/finance/tax-export', label: '财税导出' },
  ]},
  { key: 'crm', title: 'CRM客户管理', paths: [
    { path: '/crm', label: '客户档案' },
    { path: '/crm/receivables', label: '应收账款' },
  ]},
  { key: 'system', title: '系统设置', paths: [
    { path: '/system/profile', label: '个人中心' },
    { path: '/system/user', label: '人员管理' },
    { path: '/system/user-approval', label: '用户审批' },
    { path: '/system/role', label: '岗位管理' },
    { path: '/system/organization', label: '组织架构' },
    { path: '/system/dict', label: '字典管理' },
    { path: '/system/logs', label: '系统日志' },
    { path: '/system/tutorial', label: '系统教学' },
    { path: '/system/data-import', label: '数据导入' },
    { path: '/system/orphan-data', label: '孤立数据' },
  ]},
  { key: 'appStore', title: '应用商店', paths: [
    { path: '/system/app-store', label: '应用商店' },
  ]},
  { key: 'tenant', title: 'API对接管理', paths: [
    { path: '/system/tenant', label: 'API对接管理' },
  ]},
  { key: 'intelligence', title: '智能运营中心', paths: [
    { path: '/intelligence/center', label: '智能运营中心' },
    { path: '/cockpit', label: '数据看板' },
  ] },
  { key: 'integrationCenter', title: '集成对接中心', paths: [
    { path: '/integration/center', label: '集成对接中心' },
  ]},
];

export const ALL_MODULE_PATHS = MODULE_SECTIONS.flatMap(section => section.paths.map(item => item.path));

export const PLAN_OPTIONS = [
  { value: 'TRIAL', label: '免费试用', monthlyFee: 0, storageQuotaMb: 1024, maxUsers: 5 },
  { value: 'BASIC', label: '基础版', monthlyFee: 199, storageQuotaMb: 5120, maxUsers: 20 },
  { value: 'PRO', label: '专业版', monthlyFee: 499, storageQuotaMb: 20480, maxUsers: 50 },
  { value: 'ENTERPRISE', label: '企业版', monthlyFee: 999, storageQuotaMb: 102400, maxUsers: 200 },
];

export const TRIAL_OPTIONS = [
  { value: 15, label: '15天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
  { value: 0, label: '永久免费' },
];

export const MODULE_OPTIONS = [
  { value: 'CRM_MODULE', label: 'CRM 客户管理' },
  { value: 'PROCUREMENT', label: '供应商采购管理' },
  { value: 'FINANCE_TAX', label: '财税导出' },
];

export const DURATION_OPTIONS = [
  { value: 0, label: '永久' },
  { value: 12, label: '12个月' },
  { value: 6, label: '6个月' },
  { value: 3, label: '3个月' },
  { value: 1, label: '1个月' },
];
