import React from 'react';
import { RightOutlined } from '@ant-design/icons';

const ActionRow: React.FC<{
  icon: React.ReactNode; color: string; title: string;
  path: string; onNav: (p: string) => void;
}> = ({ icon, color, title, path, onNav }) => (
  <div
    onClick={() => onNav(path)}
    style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderRadius: 8, background: 'var(--color-bg-container)', border: '1px solid var(--color-border-light)',
      marginBottom: 8, cursor: 'pointer', transition: 'background 0.15s',
    }}
    onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-highlight)')}
    onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-container)')}
  >
    <span style={{ fontSize: 13, color }}>{icon}</span>
    <span className="u-flex-1 u-fs-14" style={{ color: 'var(--color-text)' }}>{title}</span>
    <RightOutlined className="u-fs-13" style={{ color: 'var(--color-text-quaternary)' }} />
  </div>
);

export default ActionRow;
