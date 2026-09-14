import React from 'react';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div className="u-d-flex u-ai-center u-gap-8">
    <span className="u-fs-14" style={{ color: 'var(--color-primary)' }}>{icon}</span>
    <span className="u-fs-14" style={{ color: 'var(--color-text-tertiary)', minWidth: 32 }}>{label}</span>
    <span className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
  </div>
);

export default InfoRow;
