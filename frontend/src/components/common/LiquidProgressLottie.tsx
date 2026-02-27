import React from 'react';

interface LiquidProgressLottieProps {
  progress: number;
  size?: number;
  color1?: string;
  color2?: string;
  width?: number;  // 新增：胶囊宽度
  height?: number; // 新增：胶囊高度
  text?: string;   // 新增：自定义文本
  nodeName?: string; // 新增：工序名称
  paused?: boolean; // 新增：暂停动画（关单/已完成/已取消时传 true）
}

const LiquidProgressLottie: React.FC<LiquidProgressLottieProps> = ({
  progress,
  size = 60,
  color1 = '#52c41a',
  color2 = '#95de64',
  width,
  height,
  text,
  nodeName,
  paused = false,
}) => {
  // 小圆球：使用固定的圆形尺寸，比原来小一点
  const ballSize = size * 0.8; // 缩小到原来的80%
  const ballWidth = width || ballSize;
  const ballHeight = height || ballSize;
  const borderRadius = '50%'; // 圆形

  return (
    <div
      style={{
        width: ballWidth,
        height: ballHeight,
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {/* 圆球边框 */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: borderRadius,
          border: `2px solid ${color1}`,
          position: 'absolute',
          top: 0,
          left: 0,
          boxSizing: 'border-box',
          boxShadow: progress > 0 && progress < 100
            ? `0 0 6px ${color1}40, inset 0 0 3px ${color2}30`
            : progress >= 100
              ? `0 0 6px ${color1}50`
              : 'none',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
      />

      {/* 液体进度条容器 - 从下往上填充 */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: borderRadius,
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--color-bg-subtle)',
        }}
      >
        {/* 第一层波浪 */}
        <div
          className="lottie-liquid-wave"
          style={{
            width: '200%',
            height: '200%',
            position: 'absolute',
            bottom: `${progress * 0.9 - 190}%`,
            left: '-50%',
            background: `linear-gradient(180deg, ${color2} 0%, ${color1} 50%, ${color2} 100%)`,
            borderRadius: '43%',
            animation: (paused || progress >= 100)
              ? 'none'
              : `liquidWave ${5 + (100 - progress) / 25}s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
            transition: 'bottom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
        {/* 第二层波浪（反向） */}
        <div
          className="lottie-liquid-wave-2"
          style={{
            width: '200%',
            height: '200%',
            position: 'absolute',
            bottom: `${progress * 0.9 - 188}%`,
            left: '-50%',
            background: `linear-gradient(180deg, ${color1} 0%, ${color2} 50%, ${color1} 100%)`,
            borderRadius: '45%',
            animation: (paused || progress >= 100)
              ? 'none'
              : `liquidWave2 ${6 + (100 - progress) / 20}s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
            transition: 'bottom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: 0.6,
            transition: 'bottom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>

      {/* 文字显示在圆球内部中心 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: "var(--font-size-xs)",
          fontWeight: 600,
          pointerEvents: 'none',
          zIndex: 2,
          whiteSpace: 'nowrap',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {/* 工序名称 */}
        {nodeName && (
          <span
            style={{
              color: '#1f2937',
              fontWeight: 700,
              fontSize: "var(--font-size-xs)",
              textShadow: '0 1px 2px rgba(255,255,255,0.8)',
            }}
          >
            {nodeName}
          </span>
        )}
        {/* 进度文字 */}
        <span
          style={{
            color: progress >= 100 ? '#059669' : '#6b7280',
            fontSize: 10,
            fontWeight: 600,
            textShadow: '0 1px 2px rgba(255,255,255,0.8)',
          }}
        >
          {text || `${Math.round(progress)}%`}
        </span>
      </div>

      <style>{`
        @keyframes liquidWave {
          0% {
            transform: translateX(0) translateY(0) rotate(0deg);
            filter: saturate(110%) brightness(0.96);
          }
          12.5% {
            transform: translateX(-4%) translateY(-1%) rotate(-2deg);
            filter: saturate(110%) brightness(0.92);
          }
          25% {
            transform: translateX(-7%) translateY(0) rotate(-3deg);
            filter: saturate(110%) brightness(0.90);
          }
          37.5% {
            transform: translateX(-4%) translateY(1%) rotate(-2deg);
            filter: saturate(110%) brightness(0.92);
          }
          50% {
            transform: translateX(0) translateY(0) rotate(0deg);
            filter: saturate(110%) brightness(0.96);
          }
          62.5% {
            transform: translateX(4%) translateY(-1%) rotate(2deg);
            filter: saturate(110%) brightness(0.92);
          }
          75% {
            transform: translateX(7%) translateY(0) rotate(3deg);
            filter: saturate(110%) brightness(0.90);
          }
          87.5% {
            transform: translateX(4%) translateY(1%) rotate(2deg);
            filter: saturate(110%) brightness(0.92);
          }
          100% {
            transform: translateX(0) translateY(0) rotate(0deg);
            filter: saturate(110%) brightness(0.96);
          }
        }

        @keyframes liquidWave2 {
          0% {
            transform: translateX(0) translateY(0) rotate(0deg);
            filter: saturate(105%) brightness(0.98);
          }
          12.5% {
            transform: translateX(5%) translateY(1%) rotate(2.5deg);
            filter: saturate(105%) brightness(0.94);
          }
          25% {
            transform: translateX(8%) translateY(0) rotate(3.5deg);
            filter: saturate(105%) brightness(0.92);
          }
          37.5% {
            transform: translateX(5%) translateY(-1%) rotate(2.5deg);
            filter: saturate(105%) brightness(0.94);
          }
          50% {
            transform: translateX(0) translateY(0) rotate(0deg);
            filter: saturate(105%) brightness(0.98);
          }
          62.5% {
            transform: translateX(-5%) translateY(1%) rotate(-2.5deg);
            filter: saturate(105%) brightness(0.94);
          }
          75% {
            transform: translateX(-8%) translateY(0) rotate(-3.5deg);
            filter: saturate(105%) brightness(0.92);
          }
          87.5% {
            transform: translateX(-5%) translateY(-1%) rotate(-2.5deg);
            filter: saturate(105%) brightness(0.94);
          }
          100% {
            transform: translateX(0) translateY(0) rotate(0deg);
            filter: saturate(105%) brightness(0.98);
          }
        }
      `}</style>
    </div>
  );
};

export default LiquidProgressLottie;
