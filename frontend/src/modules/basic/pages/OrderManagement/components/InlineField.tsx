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
    <div className="u-d-grid u-gap-6 u-ai-center" style={{ gridTemplateColumns: '60px minmax(0, 1fr)' }}>
      <div className="u-fs-14 u-ws-nowrap" style={{ lineHeight: '22px', color: 'var(--neutral-text)' }}>{label}</div>
      <div style={{ width: 'calc(100% - 20px)' }}>{children}</div>
    </div>
  );
};

export default InlineField;
