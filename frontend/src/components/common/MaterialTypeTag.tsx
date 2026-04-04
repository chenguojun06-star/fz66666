import React from 'react';
import { Tag } from 'antd';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';

interface MaterialTypeTagProps {
  value?: unknown;
}

const COLOR_MAP = {
  fabric: 'geekblue',
  lining: 'cyan',
  accessory: 'purple',
} as const;

const MaterialTypeTag: React.FC<MaterialTypeTagProps> = ({ value }) => {
  const category = getMaterialTypeCategory(value);
  return <Tag color={COLOR_MAP[category]}>{getMaterialTypeLabel(value)}</Tag>;
};

export default MaterialTypeTag;
