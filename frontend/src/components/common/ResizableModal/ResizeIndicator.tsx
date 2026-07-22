import React from 'react';

interface ResizeIndicatorProps {
  width: number;
  height: number;
  visible: boolean;
}

const ResizeIndicator: React.FC<ResizeIndicatorProps> = ({ width, height, visible }) => {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        right: 40,
        bottom: 10,
        padding: '2px 8px',
        fontSize: 'var(--font-size-sm)',
        lineHeight: '16px',
        background: 'rgba(0,0,0,0.55)',
        color: 'var(--color-bg-base)',
        borderRadius: 999,
        zIndex: 2147483647,
        pointerEvents: 'none',
      }}
    >
      {Math.round(width)}×{Math.round(height)}
    </div>
  );
};

export default ResizeIndicator;
