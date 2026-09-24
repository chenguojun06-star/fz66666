import React from 'react';
import {
  AccountBookOutlined,
  AuditOutlined,
  DollarOutlined,
  ExportOutlined,
  FileTextOutlined,
  InboxOutlined,
  PrinterOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ScissorOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

export interface QuickEntryConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  className: string;
  enabled: boolean;
}

/**
 * D-526 首页聚水潭化：快捷宫格升级为首屏主视觉（原为底部小卡 9 入口）。
 * 默认 14 个开启（7 列 × 2 行整满），低频入口默认关闭但仍可在「配置」里打开。
 * 存储键升到 v2：新布局是新信息架构，不让旧版 9 宫格的开关记忆污染新默认值。
 */
export const ALL_QUICK_ENTRIES: QuickEntryConfig[] = [
  { id: 'style', icon: <TagOutlined />, label: '样衣开发', href: '/style-info', className: 'style', enabled: true },
  { id: 'order-entry', icon: <ShopOutlined />, label: '商品下单', href: '/order-management', className: 'order', enabled: true },
  { id: 'production', icon: <ThunderboltOutlined />, label: '大货生产', href: '/production', className: 'production', enabled: true },
  { id: 'cutting', icon: <ScissorOutlined />, label: '裁剪管理', href: '/production/cutting', className: 'cutting', enabled: true },
  { id: 'material', icon: <ShoppingCartOutlined />, label: '物料采购', href: '/production/material', className: 'material', enabled: true },
  { id: 'picking', icon: <ExportOutlined />, label: '领料出库', href: '/production/picking', className: 'picking', enabled: true },
  { id: 'warehousing', icon: <SafetyCertificateOutlined />, label: '质检入库', href: '/production/warehousing', className: 'warehousing', enabled: true },
  { id: 'finished-inventory', icon: <InboxOutlined />, label: '商品仓储', href: '/warehouse/finished', className: 'finished', enabled: true },
  { id: 'inventory-check', icon: <AuditOutlined />, label: '库存盘点', href: '/warehouse/inventory-check', className: 'check', enabled: true },
  { id: 'label-print', icon: <PrinterOutlined />, label: '吊牌打印', href: '/warehouse/label-print', className: 'label', enabled: true },
  { id: 'wage-payment', icon: <DollarOutlined />, label: '收付款中心', href: '/finance/wage-payment', className: 'wage', enabled: true },
  { id: 'finance-dashboard', icon: <AccountBookOutlined />, label: '财务总览', href: '/finance/dashboard', className: 'finance', enabled: true },
  { id: 'xiaoyun', icon: <RobotOutlined />, label: '问小云', href: '/intelligence/center', className: 'ai', enabled: true },
  { id: 'material-reconciliation', icon: <FileTextOutlined />, label: '物料对账', href: '/finance/material-reconciliation', className: 'report', enabled: true },
  // —— 低频：默认关闭，配置弹窗里可打开 ——
  { id: 'factory', icon: <InboxOutlined />, label: '供应商管理', href: '/system/factory', className: 'factory', enabled: false },
  { id: 'factory-reconciliation', icon: <AccountBookOutlined />, label: '工厂对账', href: '/finance/factory-reconciliation', className: 'factory-recon', enabled: false },
  { id: 'shipment-reconciliation', icon: <FileTextOutlined />, label: '发货对账', href: '/finance/shipment-reconciliation', className: 'shipment', enabled: false },
];

export const STORAGE_KEY = 'dashboard_quick_entries_v2';
