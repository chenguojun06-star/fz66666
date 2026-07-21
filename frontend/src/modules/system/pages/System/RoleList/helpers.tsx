import React from 'react';
import {
  UserOutlined, TeamOutlined,
  EditOutlined, FileTextOutlined,
  CrownOutlined, UserSwitchOutlined,
  ShoppingOutlined, FileOutlined, BarChartOutlined,
  ToolOutlined, ContainerOutlined, HomeOutlined,
  DollarOutlined, AuditOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { Role } from '@/types/system';
import { permissionCodes } from '@/routeConfig';

// ===== 权限模块配置（用于权限矩阵渲染） =====
export const MODULE_SECTIONS = [
  { title: '仪表盘', items: [{ label: '仪表盘', code: permissionCodes.dashboard }] },
  { title: '选品中心', items: [{ label: '选品中心', code: permissionCodes.selection }] },
  { title: '样衣管理', items: [
    { label: '样衣开发', code: permissionCodes.styleInfo },
    { label: '资料单价', code: permissionCodes.dataCenter },
    { label: '样衣库存', code: permissionCodes.sampleInventory },
    { label: '下单管理', code: permissionCodes.orderManagement },
  ]},
  { title: '物料管理', items: [
    { label: '物料采购', code: permissionCodes.materialPurchase },
    { label: '物料出入库', code: permissionCodes.materialInventory },
    { label: '物料新增', code: permissionCodes.materialDatabase },
  ]},
  { title: '生产管理', items: [
    { label: '生产订单', code: permissionCodes.productionList },
    { label: '裁剪管理', code: permissionCodes.cutting },
    { label: '工序跟进', code: permissionCodes.progress },
    { label: '外发工厂', code: permissionCodes.progress },
    { label: '质检入库', code: permissionCodes.warehousing },
  ]},
  { title: '供应商管理', items: [{ label: '供应商管理', code: permissionCodes.factory }] },
  { title: '成品管理', items: [
    { label: '成品出入库', code: permissionCodes.finishedInventory },
    { label: '成品资料', code: permissionCodes.productInfo },
    { label: '标签打印', code: permissionCodes.labelPrint },
    { label: '库存盘点', code: permissionCodes.inventoryCheck },
    { label: '库位地图', code: permissionCodes.warehouseLocationMap },
  ]},
  { title: '电商运营', items: [
    { label: '平台总览', code: permissionCodes.ecommerceCenter },
    { label: '电商订单', code: permissionCodes.ecommerceOrders },
    { label: 'EC销售收入', code: permissionCodes.financeTaxExport },
  ]},
  { title: 'CRM客户管理', items: [
    { label: '客户档案', code: permissionCodes.crm },
    { label: '应收账款', code: permissionCodes.crmReceivables },
  ]},
  { title: '财务管理', items: [
    { label: '财务总览', code: permissionCodes.financeDashboard },
    { label: '工资结算', code: permissionCodes.financeCenter },
    { label: '外发结算', code: permissionCodes.financeCenter },
    { label: '物料对账', code: permissionCodes.materialRecon },
    { label: '应收账款', code: permissionCodes.crmReceivables },
    { label: '应付账款', code: permissionCodes.materialRecon },
    { label: '付款计划', code: permissionCodes.materialRecon },
    { label: '收付款中心', code: permissionCodes.wagePayment },
    { label: '费用管理', code: permissionCodes.expenseReimbursement },
    { label: '财税工具', code: permissionCodes.financeTaxExport },
    { label: '损耗分析', code: permissionCodes.orderWasteAnalysis },
  ]},
  { title: '系统设置', items: [
    { label: '个人中心', code: 'PUBLIC' },
    { label: '人员管理', code: permissionCodes.user },
    { label: '岗位管理', code: permissionCodes.role },
    { label: '组织架构', code: permissionCodes.organization },
    { label: '合作企业管理', code: permissionCodes.partnerManagement },
  ]},
  { title: '工具', items: [
    { label: '数据导入', code: permissionCodes.dataImport },
    { label: '字典管理', code: permissionCodes.dict },
    { label: '字段配置', code: permissionCodes.dict },
    { label: '打印模板', code: permissionCodes.printTemplate },
    { label: '系统日志', code: permissionCodes.systemLogs },
    { label: '系统教学', code: permissionCodes.tutorial },
    { label: '孤立数据', code: permissionCodes.systemIssues },
  ]},
  { title: '应用商店', items: [{ label: '应用商店', code: permissionCodes.appStore }] },
  { title: '客户管理', items: [{ label: '客户管理', code: permissionCodes.customerManagement }] },
  { title: 'API对接管理', items: [{ label: 'API对接管理', code: permissionCodes.tenantManagement }] },
  { title: '智能运营中心', items: [
    { label: '智能运营中心', code: permissionCodes.intelligenceCenter },
    { label: '数据看板', code: permissionCodes.intelligenceCenter },
  ]},
];

// ===== 类型定义 =====
export type PermissionNode = {
  id?: number | string;
  parentId?: number;
  permissionCode?: string;
  permissionName?: string;
  permissionType?: string;
  children?: PermissionNode[];
};

export type RoleRecord = Role & Record<string, unknown>;

export type OperationLog = {
  id?: number | string;
  bizType?: string;
  bizId?: string;
  action?: string;
  operator?: string;
  remark?: string;
  createTime?: string;
};

export type RemarkModalState = {
  open: boolean;
  title: string;
  okText: string;
  okDanger: boolean;
  onConfirm: (remark: string) => Promise<void>;
};

// ===== 角色图标映射 =====
export const ROLE_ICON_MAP: Record<string, React.ReactNode> = {
  '超级管理员': <CrownOutlined />,
  '管理员': <TeamOutlined />,
  '人事': <TeamOutlined />,
  '财务': <DollarOutlined />,
  '销售': <ShoppingOutlined />,
  '设计师': <EditOutlined />,
  '纸样师': <FileOutlined />,
  '裁板师': <ToolOutlined />,
  '车版师': <ContainerOutlined />,
  '跟单': <FileTextOutlined />,
  '跟单专员': <FileTextOutlined />,
  '采购': <CarOutlined />,
  '采购专员': <CarOutlined />,
  '仓库': <HomeOutlined />,
  '质检': <AuditOutlined />,
  '摄影师': <BarChartOutlined />,
  '美工': <BarChartOutlined />,
  '手工': <ToolOutlined />,
};

// ===== 工具函数 =====
export const getRoleIcon = (name: string) => {
  for (const [key, icon] of Object.entries(ROLE_ICON_MAP)) {
    if (name.includes(key)) return icon;
  }
  return <UserSwitchOutlined />;
};

// 复用图标导出（供子组件使用，避免重复导入）
export const SHARED_ICONS = {
  UserOutlined,
  TeamOutlined,
  EditOutlined,
  FileTextOutlined,
  CrownOutlined,
  UserSwitchOutlined,
  ShoppingOutlined,
  FileOutlined,
  BarChartOutlined,
  ToolOutlined,
  ContainerOutlined,
  HomeOutlined,
  DollarOutlined,
  AuditOutlined,
  CarOutlined,
};
