import React from 'react';

interface InlineFieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
}

const InlineField: React.FC<InlineFieldProps> = ({
  label,
  children,
}) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px minmax(0, 1fr)', gap: 6, alignItems: 'center' }}>
      <div style={{ fontSize: 14, lineHeight: '22px', color: 'var(--neutral-text)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ width: 'calc(100% - 20px)' }}>{children}</div>
    </div>
  );
};

export default InlineField;
