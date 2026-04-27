import React from 'react';

const InfoItem: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div>
    <span style={{ color: 'var(--color-text-secondary)' }}>{label}：</span>
    <span style={{ fontWeight: 600, color: '#111827' }}>{value || '-'}</span>
  </div>
);

export default InfoItem;
