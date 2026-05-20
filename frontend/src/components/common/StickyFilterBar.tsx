import React from 'react';

interface StickyFilterBarProps {
  children: React.ReactNode;
}

const StickyFilterBar: React.FC<StickyFilterBarProps> = ({ children }) => (
  <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--neutral-light)' }}>
    {children}
  </div>
);

export default StickyFilterBar;
