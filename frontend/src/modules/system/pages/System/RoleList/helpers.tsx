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
// 规则：每个权限码（MENU_*）只出现一次。多个菜单共享同一权限码时合并为一项并在标签中注明，
// 避免同码多项造成的勾选联动、重复计数（历史遗留：外发工厂/工资结算/应付账款等 13 处重复项已清理）。
// D-279：label 对齐侧边栏权威命名（menuConfig），子菜单中文名由迁移统一刷成同名，
// 矩阵渲染子模块行用本表 label，不再直接显示 DB 节点名（历史名脱节：样衣出入库/我的订单/审批付款…）。
export const MODULE_SECTIONS = [
  { title: '仪表盘', items: [{ label: '仪表盘', code: permissionCodes.dashboard }] },
  { title: '选品中心', items: [{ label: '选品中心', code: permissionCodes.selection }] },
  { title: '样衣管理', items: [
    { label: '样衣开发', code: permissionCodes.styleInfo },
    { label: '资料维护', code: permissionCodes.dataCenter },
    { label: '样衣库存', code: permissionCodes.sampleInventory },
    { label: '商品下单', code: permissionCodes.orderManagement },
  ]},
  { title: '物料管理', items: [
    { label: '物料采购', code: permissionCodes.materialPurchase },
    { label: '物料仓储', code: permissionCodes.materialInventory },
    { label: '物料资料', code: permissionCodes.materialDatabase },
  ]},
  { title: '生产管理', items: [
    { label: '生产订单', code: permissionCodes.productionList },
    { label: '裁剪管理', code: permissionCodes.cutting },
    { label: '工序跟进（含外发/看板）', code: permissionCodes.progress },
    { label: '质检入库', code: permissionCodes.warehousing },
  ]},
  // 供应商管理/组织架构/合作企业共用 MENU_FACTORY 权限码，合并为一项
  { title: '供应商管理', items: [{ label: '供应商管理（含组织架构/合作企业）', code: permissionCodes.factory }] },
  { title: '成品管理', items: [
    { label: '成品仓库（含电商订单/库存盘点）', code: permissionCodes.finishedInventory },
    { label: '成品资料', code: permissionCodes.productInfo },
    { label: '标签打印', code: permissionCodes.labelPrint },
    { label: '库位地图', code: permissionCodes.warehouseLocationMap },
  ]},
  { title: '电商运营', items: [
    { label: '平台总览', code: permissionCodes.ecommerceCenter },
  ]},
  { title: 'CRM客户管理', items: [
    { label: '客户档案（含应收账款）', code: permissionCodes.crm },
  ]},
  { title: '财务管理', items: [
    // MENU_FINISHED_SETTLEMENT 同时是 财务总览/工资结算/外发结算 三个页面的准入码（routeToPermissionCode）
    { label: '财务总览（含外发结算）', code: permissionCodes.financeDashboard },
    { label: '工资结算', code: permissionCodes.payrollSummary },
    { label: '物料对账', code: permissionCodes.materialRecon },
    { label: '收付款中心（含付款计划）', code: permissionCodes.wagePayment },
    { label: '员工借支', code: permissionCodes.employeeAdvance },
    { label: '费用报销', code: permissionCodes.expenseReimbursement },
    { label: '财税工具（含EC销售收入）', code: permissionCodes.financeTaxExport },
  ]},
  { title: '系统设置', items: [
    { label: '个人中心', code: 'PUBLIC' },
    { label: '人员管理（含考勤管理）', code: permissionCodes.user },
    { label: '岗位与权限', code: permissionCodes.role },
  ]},
  { title: '工具', items: [
    { label: '数据导入', code: permissionCodes.dataImport },
    { label: '字典管理（含字段配置/打印模板）', code: permissionCodes.dict },
    { label: '系统日志', code: permissionCodes.systemLogs },
    { label: '系统教学', code: permissionCodes.tutorial },
  ]},
  { title: '应用商店', items: [{ label: '应用商店', code: permissionCodes.appStore }] },
  { title: '客户管理', items: [{ label: '客户管理', code: permissionCodes.customerManagement }] },
  { title: 'API对接管理', items: [{ label: 'API对接管理', code: permissionCodes.tenantManagement }] },
  { title: '智能运营中心', items: [
    { label: '智能运营中心（含数据看板）', code: permissionCodes.intelligenceCenter },
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
