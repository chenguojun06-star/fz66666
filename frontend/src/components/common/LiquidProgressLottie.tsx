import React from 'react';

interface LiquidProgressLottieProps {
  progress: number;
  size?: number;
  color1?: string;
  color2?: string;
}

const LiquidProgressLottie: React.FC<LiquidProgressLottieProps> = ({
  progress,
  size = 60,
  color1 = '#52c41a',
  color2 = '#95de64',
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '3px solid #d1d1d1',
          position: 'absolute',
          top: 0,
          left: 0,
          boxSizing: 'border-box',
        }}
      />

      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
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
            animation: progress >= 100
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
            animation: progress >= 100
              ? 'none'
              : `liquidWave2 ${6 + (100 - progress) / 20}s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
            opacity: 0.6,
            transition: 'bottom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: size > 50 ? 14 : 12,
          fontWeight: 700,
          color: '#555',
          textShadow: '0 1px 2px rgba(255,255,255,0.8)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {Math.round(progress)}%
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
