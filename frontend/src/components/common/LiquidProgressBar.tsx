import React from 'react';

interface LiquidProgressBarProps {
  percent: number;
  width?: number | string;
  height?: number;
  color?: string;
  backgroundColor?: string;
  status?: 'normal' | 'warning' | 'danger' | 'default';
  isCompleted?: boolean;
  minVisiblePercent?: number;
}

const LiquidProgressBar: React.FC<LiquidProgressBarProps> = ({
  percent,
  width = '100%',
  height = 16,
  color,
  backgroundColor = '#f0f0f0',
  status = 'normal',
  isCompleted: externalIsCompleted,
  minVisiblePercent = 0,
}) => {
  const isCompleted = externalIsCompleted !== undefined ? externalIsCompleted : percent >= 100;
  const isFrozen = status === 'default';
  const safePercent = Math.max(0, percent);
  const visibleFloor = Math.max(0, minVisiblePercent);
  const displayWidth = safePercent <= 0 ? visibleFloor : Math.max(visibleFloor, safePercent);

  const getColors = () => {
    if (isFrozen) {
      return { liquidColor: '#9ca3af', liquidColor2: '#d1d5db' };
    }
    if (color) {
      return { liquidColor: color, liquidColor2: color };
    }
    if (isCompleted) {
      return { liquidColor: '#52c41a', liquidColor2: '#95de64' };
    }
    if (status === 'danger') {
      return { liquidColor: '#ff4d4f', liquidColor2: '#ff7875' };
    } else if (status === 'warning') {
      return { liquidColor: '#faad14', liquidColor2: '#ffc53d' };
    } else {
      return { liquidColor: '#52c41a', liquidColor2: '#95de64' };
    }
  };

  const { liquidColor, liquidColor2 } = getColors();

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: backgroundColor,
        borderRadius: height / 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${displayWidth}%`,
          height: '100%',
          position: 'absolute',
          left: 0,
          top: 0,
          overflow: 'hidden',
          borderRadius: height / 2,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            background: `linear-gradient(180deg, ${liquidColor} 0%, ${liquidColor2} 50%, ${liquidColor} 100%)`,
          }}
        />
        {(isCompleted || isFrozen) ? null : (
          <div
            style={{
              width: '200%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              background: `linear-gradient(90deg, 
                transparent 0%, 
                rgba(255,255,255,0.15) 25%, 
                rgba(255,255,255,0.3) 50%, 
                rgba(255,255,255,0.15) 75%, 
                transparent 100%
              )`,
              animation: 'liquidShine 3s ease-in-out infinite',
            }}
          />
        )}
        {(isCompleted || isFrozen) ? null : (
          <svg
            viewBox="0 0 100 20"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              top: -2,
              left: 0,
              width: '200%',
              height: 10,
              animation: 'liquidWave 2.5s ease-in-out infinite',
            }}
          >
            <path
              d="M0 10 Q5 5 10 10 T20 10 T30 10 T40 10 T50 10 T60 10 T70 10 T80 10 T90 10 T100 10"
              fill={liquidColor2}
              opacity="0.6"
            />
          </svg>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: height > 14 ? 11 : 10,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          textShadow: '0 1px 2px rgba(255,255,255,0.8)',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}
      >
        {isCompleted && !isFrozen ? '已完成' : `${Math.round(safePercent)}%`}
      </div>

      <style>{`
        @keyframes liquidShine {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes liquidWave {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-25%); }
        }
      `}</style>
    </div>
  );
};

export default LiquidProgressBar;
