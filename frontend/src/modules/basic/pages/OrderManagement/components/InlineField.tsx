import React from 'react';

interface InlineFieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
}

const InlineField: React.FC<InlineFieldProps> = ({
  label,
  children,
}) => {
  // D-442：标签改到输入框上方（此前 60px 网格把标签挤在输入框左侧，
  // 且 --neutral-text 太浅看不清——用户多次反馈"文字要上面、输入框在下面"）
  return (
    <div className="u-d-flex u-fd-column" style={{ gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{label}</div>
      <div style={{ width: '100%' }}>{children}</div>
    </div>
  );
};

export default InlineField;
