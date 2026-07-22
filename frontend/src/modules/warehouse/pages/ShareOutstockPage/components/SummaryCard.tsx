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
    <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{value}</div>
  </div>
);

export default SummaryCard;
