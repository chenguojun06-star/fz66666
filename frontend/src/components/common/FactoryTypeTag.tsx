import React from 'react';
import { Tag } from 'antd';

export const FACTORY_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; fg: string }> = {
  INTERNAL: { label: '内部', color: 'blue', bg: '#edf3fb', fg: '#6283a8' },
  EXTERNAL: { label: '外发', color: 'purple', bg: '#f2edf9', fg: '#8c78b1' },
};

export const getFactoryTypeConfig = (factoryType: string | undefined | null) => {
  const key = String(factoryType || '').trim();
  return FACTORY_TYPE_CONFIG[key] || null;
};

const softTagStyle = (background: string, foreground: string): React.CSSProperties => ({
  margin: 0,
  fontSize: 12,
  lineHeight: '18px',
  padding: '0 4px',
  border: 'none',
  background,
  color: foreground,
});

const FactoryTypeTag: React.FC<{
  factoryType?: string | null;
  softStyle?: boolean;
  style?: React.CSSProperties;
}> = ({ factoryType, softStyle = false, style }) => {
  const config = getFactoryTypeConfig(factoryType);
  if (!config) return null;
  if (softStyle) {
    return <Tag style={{ ...softTagStyle(config.bg, config.fg), ...style }}>{config.label}</Tag>;
  }
  return <Tag color={config.color} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px', height: 18, ...style }}>{config.label}</Tag>;
};

export default FactoryTypeTag;
