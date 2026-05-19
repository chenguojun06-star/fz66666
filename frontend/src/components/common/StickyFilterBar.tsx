import React from 'react';

interface StickyFilterBarProps {
  children: React.ReactNode;
}

const StickyFilterBar: React.FC<StickyFilterBarProps> = ({ children }) => (
  <div style={{
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--color-bg-base)',
    borderBottom: '1px solid var(--color-border-light)',
    padding: '8px 0',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  }}>
    {children}
  </div>
);

export default StickyFilterBar;
