import React from 'react';
import { Tag } from 'antd';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';

/**
 * 获取订单状态的文本/颜色配置
 * 做大小写 + 前后空白兼容：未匹配时返回 '未知' / 'default'
 * 与小程序 orderStatusHelper.js 及后端 ProductionOrder.status 保持一致
 */
export const getOrderStatusConfig = (status: string | undefined | null) => {
  const raw = String(status ?? '').trim();
  if (!raw) {
    return { text: '-', label: '-', color: 'default' };
  }
  // 先精确匹配，再小写匹配，最后大写兜底
  const label = ORDER_STATUS_LABEL[raw] ?? ORDER_STATUS_LABEL[raw.toLowerCase()] ?? ORDER_STATUS_LABEL[raw.toUpperCase()] ?? '未知';
  const color = ORDER_STATUS_COLOR[raw] ?? ORDER_STATUS_COLOR[raw.toLowerCase()] ?? ORDER_STATUS_COLOR[raw.toUpperCase()] ?? 'default';
  return { text: label, label, color };
};

const OrderStatusTag: React.FC<{ status?: string | null; style?: React.CSSProperties }> = ({ status, style }) => {
  const { label, color } = getOrderStatusConfig(status);
  return <Tag color={color} style={style}>{label}</Tag>;
};

export default OrderStatusTag;
