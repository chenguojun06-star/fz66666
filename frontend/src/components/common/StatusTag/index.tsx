import React from 'react';
import { Tag } from 'antd';
import type { StatusMap } from '@/constants/statusMaps';

interface StatusTagProps {
  status: string;
  statusMap: StatusMap;
  fallback?: { text: string; color: string };
}

/**
 * 状态标签组件
 * 大小写兼容：优先精确匹配 → 小写 → 大写 → fallback
 */
const StatusTag: React.FC<StatusTagProps> = ({ status, statusMap, fallback }) => {
  const k = String(status ?? '').trim();
  const info = k
    ? (statusMap[k] ?? statusMap[k.toLowerCase()] ?? statusMap[k.toUpperCase()] ?? fallback)
    : fallback;
  const resolved = info ?? { text: k || '未知', color: 'default' };
  return <Tag color={resolved.color}>{resolved.text}</Tag>;
};

export default React.memo(StatusTag);
