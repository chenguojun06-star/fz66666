import React from 'react';
import { Tag } from 'antd';

interface StyleBomSizeColorSummaryProps {
  sizes: string[];
  colors: string[];
}

const containerStyle = {
  marginBottom: 12,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(37, 99, 235, 0.04)',
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
} as const;

const sectionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
} as const;

const labelStyle = {
  color: 'var(--color-text-secondary)',
  fontSize: 12,
} as const;

const StyleBomSizeColorSummary: React.FC<StyleBomSizeColorSummaryProps> = ({ sizes, colors }) => {
  if (!sizes.length && !colors.length) {
    return null;
  }

  return (
    <div style={containerStyle}>
      {sizes.length ? (
        <div style={sectionStyle}>
          <span style={labelStyle}>基础码数</span>
          {sizes.map((size) => <Tag key={size} style={{ margin: 0 }}>{size}</Tag>)}
        </div>
      ) : null}
      {colors.length ? (
        <div style={sectionStyle}>
          <span style={labelStyle}>基础颜色</span>
          {colors.map((color) => <Tag key={color} style={{ margin: 0 }}>{color}</Tag>)}
        </div>
      ) : null}
    </div>
  );
};

export default StyleBomSizeColorSummary;
