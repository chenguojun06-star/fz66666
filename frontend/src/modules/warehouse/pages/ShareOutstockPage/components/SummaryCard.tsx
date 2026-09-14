import React from 'react';
import { summaryCardStyle } from '../styles';

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, label, value, color }) => (
  <div style={summaryCardStyle}>
    <span style={{ color, fontSize: 15, marginBottom: 4 }}>{icon}</span>
    <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
    <div className="u-fs-14 u-fw-700 u-mt-2" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
  </div>
);

export default SummaryCard;
