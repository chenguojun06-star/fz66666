import React from 'react';
import { Tag } from 'antd';

export const REVIEW_STATUS_OPTIONS = [
  { label: ' 通过', value: 'PASS' },
  { label: ' 需修改', value: 'REWORK' },
  { label: ' 不通过', value: 'REJECT' },
];

export const reviewStatusTag = (status?: string | null) => {
  if (!status) return null;
  if (status === 'PASS')   return <Tag color="success">通过</Tag>;
  if (status === 'REWORK') return <Tag color="warning">需修改</Tag>;
  if (status === 'REJECT') return <Tag color="error">不通过</Tag>;
  return <Tag>未知</Tag>;
};

export const downloadHtmlFile = (fileName: string, html: string) => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
