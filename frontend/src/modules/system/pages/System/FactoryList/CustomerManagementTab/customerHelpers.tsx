import React from 'react';
import { Tag } from 'antd';
import type { CustomerListParams } from '@/services/crm/customerApi';

export type DialogMode = 'create' | 'edit' | 'view';

export interface CustomerQueryParams extends CustomerListParams {
  page: number;
  pageSize: number;
}

export const CUSTOMER_LEVEL_OPTIONS = [
  { value: 'VIP', label: '核心客户' },
  { value: 'NORMAL', label: '普通客户' },
];

export const CUSTOMER_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];

export const getCustomerLevelTag = (value?: string) => {
  if (value === 'VIP') return <Tag color="gold">核心客户</Tag>;
  if (value === 'NORMAL') return <Tag color="blue">普通客户</Tag>;
  return <Tag>{value || '未标记'}</Tag>;
};

export const getCustomerStatusTag = (value?: string) => {
  if (value === 'ACTIVE') return <Tag color="success">合作中</Tag>;
  if (value === 'INACTIVE') return <Tag>已停合作</Tag>;
  return <Tag>{value || '未知'}</Tag>;
};
