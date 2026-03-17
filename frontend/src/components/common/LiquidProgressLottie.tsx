import React, { useId, useEffect } from 'react';

interface LiquidProgressLottieProps {
  progress: number;
  size?: number;
  color1?: string;
  color2?: string;
  width?: number;
  height?: number;
  text?: string;
  nodeName?: string;
  paused?: boolean;
}

/** 全局注入 CSS 动画帧（只注入一次，组件挂载时执行） */
const CSS_ID = '__lr_flow_v2__';
function ensureAnimCSS() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const s = document.createElement('style');
  s.id = CSS_ID;
  s.textContent = '';
  document.head.appendChild(s);
}

/**
 * 液态环形进度（Liquid Ring Progress）
 * ▸ 厚空心环形 + CSS 色相脉冲（lrHue，替代 Chrome 不支持的 SMIL animateTransform on gradient）
 * ▸ SMIL animate 行进火花（stroke-dashoffset 从 0→-arcLen，跨浏览器可靠）
 * ▸ 辉光脉冲 + 弧尖气泡
 * ▸ useId() 保证每实例 SVG id 唯一
 * ▸ 接口与原 LiquidProgressLottie 完全兼容，调用方无需改动
 */
const LiquidProgressLottie: React.FC<LiquidProgressLottieProps> = ({
  progress,
  size = 60,
  color1 = '#52c41a',
  color2,
  width,
  height,
  text,
  nodeName,
  paused = false,
}) => {
  useEffect(ensureAnimCSS, []);

  const rawId = useId();
  const uid   = rawId.replace(/:/g, '_');
  const gid   = `grd${uid}`;
  const mid   = `msk${uid}`;

  // ── 尺寸 ──
  const D   = width || height || size * 0.8;
  const C   = D / 2;
  const SW  = Math.max(5, Math.round(D * 0.14));
  const R   = C - SW / 2 - 0.5;

  const pct     = Math.min(100, Math.max(0, progress));
  const isDone  = pct >= 100;
  const doAnim  = !paused && !isDone && pct > 0;

  // ── 颜色（完全由调用方 color1/color2 决定，组件不覆盖业务色；0%时弧不渲染，但轨道环会着色）──
  const baseC  = color1;
  const baseC2 = color2 || color1;

  // ── 弧长 & 火花长度 ──
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2 * pct) / 100;
  const startX = C + R * Math.cos(startAngle);
  const startY = C + R * Math.sin(startAngle);
  const endX = C + R * Math.cos(endAngle);
  const endY = C + R * Math.sin(endAngle);
  const largeArcFlag = pct > 50 ? 1 : 0;
  const arcPath = pct > 0 && pct < 100
    ? `M ${startX} ${startY} A ${R} ${R} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    : '';

  // ── 文字尺寸 ──
  const FS    = Math.max(7, Math.round(D * 0.18));
  const nameY = nodeName ? C - FS * 0.65 : C;
  const textY = nodeName ? C + FS * 0.75 : C;

  return (
    <div style={{ width: D, height: D, display: 'inline-block', flexShrink: 0 }}>
      <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} style={{ display: 'block' }}>
        <defs>
          {/*
           * 静态对角渐变（不使用 animateTransform — Chrome 对 linearGradient 的
           * gradientTransform 动画支持有缺陷，改用 CSS lrHue 在弧元素上做色相脉冲）
           */}
          <linearGradient id={gid} gradientUnits="userSpaceOnUse"
            x1="0" y1="0" x2={D} y2={D}>
            <stop offset="0%"   stopColor={baseC2} />
            <stop offset="100%" stopColor={baseC}  />
          </linearGradient>

          <mask id={mid}>
            <rect width={D} height={D} fill="black" />
            {pct >= 100 ? (
              <circle cx={C} cy={C} r={R}
                fill="none" stroke="white"
                strokeWidth={SW + 4}
              />
            ) : (
              arcPath && (
                <path
                  d={arcPath}
                  fill="none"
                  stroke="white"
                  strokeWidth={SW + 4}
                  strokeLinecap="round"
                />
              )
            )}
          </mask>
        </defs>

        {/* ① 轨道环（始终灰色衬底） */}
        <circle cx={C} cy={C} r={R}
          fill="none" stroke="#e4e8ee" strokeWidth={SW} />



        {/* ② 进度弧（静态，仅 dashoffset 平滑过渡） */}
        {pct > 0 && (
          pct >= 100 ? (
            <circle cx={C} cy={C} r={R}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth={SW}
              strokeLinecap="round"
            />
          ) : (
            arcPath && (
              <path
                d={arcPath}
                fill="none"
                stroke={`url(#${gid})`}
                strokeWidth={SW}
                strokeLinecap="round"
                style={{ transition: paused ? 'none' : 'd 0.7s cubic-bezier(0.34,1.56,0.64,1)' }}
              />
            )
          )
        )}

        {/* ③ 液态流动层——沿真实进度弧路径运动，不再依赖 circle dashoffset，避免 2 点方向提前截断 */}
        {doAnim && arcPath && (
          <g mask={`url(#${mid})`} style={{ pointerEvents: 'none' }}>
            <ellipse cx="0" cy="0" rx={SW * 0.95} ry={SW * 0.52} fill="rgba(255,255,255,0.20)">
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.4 0 0.6 1"
                path={arcPath}
              />
            </ellipse>
            <ellipse cx="0" cy="0" rx={SW * 0.68} ry={SW * 0.36} fill="rgba(255,255,255,0.38)">
              <animateMotion
                dur="2.6s"
                begin="-1.3s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.4 0 0.6 1"
                path={arcPath}
              />
            </ellipse>
            <ellipse cx="0" cy="0" rx={SW * 0.4} ry={SW * 0.22} fill="rgba(255,255,255,0.72)">
              <animateMotion
                dur="1.6s"
                begin="-0.6s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.4 0 0.6 1"
                path={arcPath}
              />
            </ellipse>
          </g>
        )}

        {/* ⑥ 工序名称 */}
        {nodeName && (
          <text x={C} y={nameY} textAnchor="middle" dominantBaseline="middle"
            fill="#374151" fontSize={FS} fontWeight="700" fontFamily="inherit">
            {nodeName.slice(0, 2)}
          </text>
        )}

        {/* ⑦ 进度文字 */}
        <text x={C} y={textY} textAnchor="middle" dominantBaseline="middle"
          fill={isDone ? '#237804' : '#6b7280'}
          fontSize={FS} fontWeight="600" fontFamily="inherit">
          {text || `${pct}%`}
        </text>
      </svg>
    </div>
  );
};

export default LiquidProgressLottie;
