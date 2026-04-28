import React from 'react';
import { Tag } from 'antd';

export const SCAN_TYPE_LABEL: Record<string, string> = {
  production: '生产',
  cutting: '裁剪',
  procurement: '采购',
  quality: '质检',
  pressing: '大烫',
  packaging: '包装',
  warehouse: '入库',
  warehousing: '入库',
  sewing: '车缝',
  carSewing: '车缝',
};

export const SCAN_TYPE_COLOR: Record<string, string> = {
  production: 'blue',
  cutting: 'cyan',
  procurement: 'geekblue',
  quality: 'orange',
  pressing: 'volcano',
  packaging: 'purple',
  warehouse: 'green',
  warehousing: 'green',
  sewing: 'blue',
  carSewing: 'blue',
};

export const SCAN_TYPE_OPTIONS = [
  { value: 'production', label: '生产' },
  { value: 'cutting', label: '裁剪' },
  { value: 'procurement', label: '采购' },
  { value: 'quality', label: '质检' },
  { value: 'pressing', label: '大烫' },
  { value: 'packaging', label: '包装' },
  { value: 'warehouse', label: '入库' },
  { value: 'sewing', label: '车缝' },
];

export const getScanTypeLabel = (scanType: string | undefined | null) => {
  const key = String(scanType || '').trim();
  return SCAN_TYPE_LABEL[key] || key || '-';
};

export const normalizeScanType = (scanType: string | undefined | null) => {
  const key = String(scanType || '').trim();
  if (key === 'warehousing') return 'warehouse';
  if (key === 'carSewing') return 'sewing';
  return key;
};

const ScanTypeBadge: React.FC<{ scanType?: string | null; style?: React.CSSProperties }> = ({ scanType, style }) => {
  const key = normalizeScanType(scanType);
  const label = SCAN_TYPE_LABEL[key] || key || '-';
  const color = SCAN_TYPE_COLOR[key] || 'default';
  return <Tag color={color} style={style}>{label}</Tag>;
};

export default ScanTypeBadge;
