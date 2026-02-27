import React from 'react';

interface LiquidProgressBarProps {
  percent: number;
  width?: number | string;
  height?: number;
  color?: string;
  backgroundColor?: string;
  status?: 'normal' | 'warning' | 'danger' | 'default'; // default=关单/冻结状态灰色无动画
  isCompleted?: boolean; // 明确指定是否已完成，避免自动判断
}

/**
 * 细长液体波浪进度条组件
 * 保持 LiquidProgressLottie 的波浪效果，但做成条形
 */
const LiquidProgressBar: React.FC<LiquidProgressBarProps> = ({
  percent,
  width = '100%',
  height = 12,
  color,
  backgroundColor = '#f0f0f0',
  status = 'normal',
  isCompleted: externalIsCompleted,
}) => {
  // 是否已完成：优先使用外部传入的值，否则根据进度判断（兼容旧用法）
  const isCompleted = externalIsCompleted !== undefined ? externalIsCompleted : percent >= 100;

  // 是否处于冻结状态（关单/已取消/已完成后再次渲染）：灰色、无动画、显示百分比
  const isFrozen = status === 'default';

  // 根据进度和状态自动选择颜色
  const getColors = () => {
    if (isFrozen) {
      // 关单/冻结：灰色
      return { liquidColor: '#9ca3af', liquidColor2: '#d1d5db' };
    }

    if (color) {
      // 如果指定了颜色，使用指定颜色
      return { liquidColor: color, liquidColor2: color };
    }

    if (isCompleted) {
      // 已完成：绿色
      return { liquidColor: '#52c41a', liquidColor2: '#95de64' };
    }

    // 生产中根据状态
    if (status === 'danger') {
      // 延期：红色
      return { liquidColor: '#ff4d4f', liquidColor2: '#ff7875' };
    } else if (status === 'warning') {
      // 快延期：黄色
      return { liquidColor: '#faad14', liquidColor2: '#ffc53d' };
    } else {
      // 正常：绿色（像球球一样）
      return { liquidColor: '#52c41a', liquidColor2: '#95de64' };
    }
  };

  const { liquidColor, liquidColor2 } = getColors();

  // 脉冲线颜色跟随状态
  const getPulseColor = () => {
    if (isCompleted) {
      // 已完成：亮绿色
      return 'rgba(0, 255, 100, 1)';
    }

    if (status === 'danger') {
      // 延期：亮红色
      return 'rgba(255, 80, 80, 1)';
    } else if (status === 'warning') {
      // 快延期：亮黄色
      return 'rgba(255, 220, 50, 1)';
    } else {
      // 正常：亮绿色
      return 'rgba(0, 255, 100, 1)';
    }
  };

  const pulseColor = getPulseColor();

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
      {/* 液体波浪容器 */}
      <div
        style={{
          width: `${Math.max(5, percent)}%`, // 最小5%宽度，0%时也显示一点点
          height: '100%',
          position: 'absolute',
          left: 0,
          top: 0,
          overflow: 'hidden',
          borderRadius: height / 2,
          transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)', // 更慢的过渡动画
        }}
      >
        {(isCompleted || isFrozen) ? (
          /* 已完成/冻结：纯色填充，无动画 */
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(90deg, ${liquidColor} 0%, ${liquidColor2} 100%)`,
            }}
          />
        ) : (
          <>
            {/* 底部填充色 */}
            <div
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                background: `linear-gradient(90deg, ${liquidColor2} 0%, ${liquidColor} 50%, ${liquidColor2} 100%)`,
              }}
            />
            {/* 顶部波浪效果 - 只在顶部边缘波动 */}
            <div
              style={{
                width: '200%',
                height: '8px',
                position: 'absolute',
                top: '-2px',
                left: 0,
                background: `linear-gradient(90deg, ${liquidColor2} 0%, ${liquidColor} 25%, ${liquidColor2} 50%, ${liquidColor} 75%, ${liquidColor2} 100%)`,
                borderRadius: '50%',
                animation: `liquidBarTopWave 4s ease-in-out infinite`,
              }}
            />
          </>
        )}
      </div>

      {/* 百分比文字显示在进度条内部 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: height > 16 ? 12 : 10,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          textShadow: '0 1px 2px rgba(255,255,255,0.8)',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}
      >
        {isCompleted && !isFrozen ? '已完成' : `${Math.round(percent)}%`}
      </div>

      {/* 脉冲波浪线效果 - 未完成且未冻结时显示 */}
      {!isCompleted && !isFrozen && percent >= 0 && (
        <>
          {/* 上边缘波浪线 */}
          <div
            className="liquid-bar-pulse-top"
            style={{
              width: '200%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              overflow: 'visible',
              pointerEvents: 'none',
              animation: 'liquidBarPulse 5s linear infinite',
            }}
          >
            <svg
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <path
                d="M 0 5 Q 5 2 10 5 T 20 5 Q 25 8 30 5 T 40 5 Q 45 3 50 5 T 60 5 Q 65 7 70 5 T 80 5 Q 85 4 90 5 T 100 5"
                stroke={pulseColor}
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 6px ${pulseColor}) drop-shadow(0 0 3px ${pulseColor})`,
                }}
              />
            </svg>
          </div>

          {/* 下边缘波浪线 */}
          <div
            className="liquid-bar-pulse-bottom"
            style={{
              width: '200%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              overflow: 'visible',
              pointerEvents: 'none',
              animation: 'liquidBarPulse 5s linear infinite',
            }}
          >
            <svg
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <path
                d="M 0 95 Q 5 92 10 95 T 20 95 Q 25 98 30 95 T 40 95 Q 45 93 50 95 T 60 95 Q 65 97 70 95 T 80 95 Q 85 94 90 95 T 100 95"
                stroke={pulseColor}
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 6px ${pulseColor}) drop-shadow(0 0 3px ${pulseColor})`,
                }}
              />
            </svg>
          </div>
        </>
      )}

      {/* 添加波浪动画的样式 */}
      <style>{`
        @keyframes liquidBarTopWave {
          0% { transform: translateX(0); }
          50% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes liquidBarPulse {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
};

export default LiquidProgressBar;
