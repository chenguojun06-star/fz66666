import React from 'react';

const MetricCard: React.FC<{
  label: string; value: number; suffix?: string; color: string; bg: string;
}> = ({ label, value, suffix = '', color, bg }) => (
  <div style={{
    flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 8,
    background: bg, textAlign: 'center',
  }}>
    <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.2 }}>
      {Number(value) || 0}{suffix}
    </div>
    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 4 }}>{label}</div>
  </div>
);

export default MetricCard;
