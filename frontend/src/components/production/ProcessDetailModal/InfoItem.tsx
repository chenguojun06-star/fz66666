import React from 'react';

const InfoItem: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div>
    <span style={{ color: 'var(--color-text-secondary)' }}>{label}：</span>
    <span className="u-fw-600" style={{ color: 'var(--color-text-primary)' }}>{value || '-'}</span>
  </div>
);

export default InfoItem;
