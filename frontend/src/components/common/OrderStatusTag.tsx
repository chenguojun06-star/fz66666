import React from 'react';
import { Tag } from 'antd';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';

export const getOrderStatusConfig = (status: string | undefined | null) => {
  const key = String(status || '').trim();
  const label = ORDER_STATUS_LABEL[key] || '未知';
  return {
    text: label,
    label,
    color: ORDER_STATUS_COLOR[key] || 'default',
  };
};

const OrderStatusTag: React.FC<{ status?: string | null; style?: React.CSSProperties }> = ({ status, style }) => {
  const { label, color } = getOrderStatusConfig(status);
  return <Tag color={color} style={style}>{label}</Tag>;
};

export default OrderStatusTag;
