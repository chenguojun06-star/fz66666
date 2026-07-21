import React from 'react';
import { Select, Tag } from 'antd';

interface Props {
  gradingDraftBaseSize: string;
  sizeColumns: string[];
  baseSizeValue: number | string | null;
  onChange: (value: string | undefined) => void;
}

const BaseSizeSection: React.FC<Props> = ({
  gradingDraftBaseSize,
  sizeColumns,
  baseSizeValue,
  onChange,
}) => {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>1. 选择基准码（样版码）</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Select
          value={gradingDraftBaseSize || undefined}
          allowClear
          placeholder="选择基准码"
          options={sizeColumns.map((size) => ({ value: size, label: size }))}
          onChange={onChange}
          style={{ width: 140 }}
        />
        {gradingDraftBaseSize && baseSizeValue !== null && (
          <Tag color="blue" style={{ fontSize: 14, padding: '2px 10px' }}>
            基准尺寸: {baseSizeValue}
          </Tag>
        )}
      </div>
      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginTop: 6 }}>
        基准码为放码的参考基准，其他码数相对于基准码递增/递减
      </div>
    </div>
  );
};

export default BaseSizeSection;
