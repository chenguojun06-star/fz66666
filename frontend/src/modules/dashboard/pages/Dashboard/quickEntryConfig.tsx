import React from 'react';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
} from '@ant-design/icons';

export interface QuickEntryConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  className: string;
  enabled: boolean;
}

export const ALL_QUICK_ENTRIES: QuickEntryConfig[] = [
  { id: 'style', icon: <TagsOutlined />, label: '样衣开发', href: '/style-info', className: 'style', enabled: true },
  { id: 'production', icon: <InboxOutlined />, label: '工序跟进', href: '/production', className: 'production', enabled: true },
  { id: 'material', icon: <ShoppingCartOutlined />, label: '物料采购', href: '/production/material', className: 'material', enabled: true },
  { id: 'warehousing', icon: <InboxOutlined />, label: '质检入库', href: '/production/warehousing', className: 'warehousing', enabled: true },
  { id: 'material-reconciliation', icon: <FileTextOutlined />, label: '物料对账', href: '/finance/material-reconciliation', className: 'report', enabled: true },
  { id: 'factory', icon: <ApartmentOutlined />, label: '供应商管理', href: '/system/factory', className: 'factory', enabled: true },
  { id: 'cutting', icon: <InboxOutlined />, label: '裁剪管理', href: '/production/cutting', className: 'cutting', enabled: false },
  { id: 'factory-reconciliation', icon: <AccountBookOutlined />, label: '工厂对账', href: '/finance/factory-reconciliation', className: 'factory-recon', enabled: false },
  { id: 'shipment-reconciliation', icon: <FileTextOutlined />, label: '发货对账', href: '/finance/shipment-reconciliation', className: 'shipment', enabled: false },
];

export const STORAGE_KEY = 'dashboard_quick_entries';
