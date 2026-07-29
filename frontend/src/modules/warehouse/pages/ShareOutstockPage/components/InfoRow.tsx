import React from 'react';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ color: 'var(--color-primary)', fontSize: 14 }}>{icon}</span>
    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, minWidth: 32 }}>{label}</span>
    <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600 }}>{value}</span>
  </div>
);

export default InfoRow;
