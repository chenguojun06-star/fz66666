import React from 'react';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ color: '#3b82f6', fontSize: 14 }}>{icon}</span>
    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, minWidth: 32 }}>{label}</span>
    <span style={{ color: '#0f172a', fontSize: 14, fontWeight: 600 }}>{value}</span>
  </div>
);

export default InfoRow;
