import React from 'react';
import { Tag } from 'antd';
import { resolveStatusByVariant, type StatusVariant, type DisplayStatusItem } from '@/utils/display';

export interface DisplayStatusTagProps {
  status: unknown;
  variant?: StatusVariant;
  style?: React.CSSProperties;
  className?: string;
}

const DisplayStatusTag: React.FC<DisplayStatusTagProps> = ({
  status,
  variant = 'order',
  style,
  className,
}) => {
  const { text, color }: DisplayStatusItem = resolveStatusByVariant(status, variant);
  return (
    <Tag color={color} style={style} className={className}>
      {text}
    </Tag>
  );
};

export default DisplayStatusTag;
