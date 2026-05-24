import React from 'react';
import { Tag } from 'antd';
import type { StatusMap } from '@/constants/statusMaps';

interface StatusTagProps {
  status: string;
  statusMap: StatusMap;
  fallback?: { text: string; color: string };
}

const StatusTag: React.FC<StatusTagProps> = ({ status, statusMap, fallback }) => {
  const info = statusMap[status] || fallback || { text: status || '未知', color: 'default' };
  return <Tag color={info.color}>{info.text}</Tag>;
};

export default React.memo(StatusTag);
