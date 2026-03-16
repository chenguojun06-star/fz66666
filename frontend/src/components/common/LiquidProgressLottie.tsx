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
const CSS_ID = '__lr_ring_anim__';
function ensureAnimCSS() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const s = document.createElement('style');
  s.id = CSS_ID;
  // lrGlow      : 辉光脉冲（弧外模糊层 opacity 0→1→0）
  // lrBubble    : 弧尖气泡呼吸（scale + opacity）
  // lrArcBreath : 进度弧透明度呼吸（液态光感核心）
  // lrStartDot  : 0% 起始点呼吸点（slow, natural）
  s.textContent = `
@keyframes lrGlow      { 0%,100%{opacity:0} 50%{opacity:1} }
@keyframes lrBubble    { 0%,100%{opacity:.32;transform:scale(.82)} 50%{opacity:1;transform:scale(1.58)} }
@keyframes lrArcBreath { 0%,100%{opacity:.60} 50%{opacity:1} }
@keyframes lrStartDot  { 0%,100%{opacity:.85;transform:scale(1)} 50%{opacity:.2;transform:scale(.6)} }
  `;
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
  const gfid  = `glf${uid}`;  // SVG glow filter id（不用 CSS filter 避免矩形合成层）

  // ── 尺寸 ──
  const D   = width || height || size * 0.8;
  const C   = D / 2;
  const SW  = Math.max(5, Math.round(D * 0.14));
  const R   = C - SW / 2 - 0.5;
  const cir = 2 * Math.PI * R;

  const pct     = Math.min(100, Math.max(0, progress));
  const dashOff = cir * (1 - pct / 100);
  const isDone  = pct >= 100;
  const doAnim  = !paused && !isDone && pct > 0;

  // ── 颜色（完全由调用方 color1/color2 决定，组件不覆盖业务色；0%时弧不渲染，但轨道环会着色）──
  const baseC  = color1;
  const baseC2 = color2 || color1;

  // ── 弧长 & 火花长度 ──
  const arcLen   = cir * pct / 100;
  const sparkLen = Math.min(cir * 0.15, D * 1.1);

  // ── 弧尖坐标 ──
  const tipAngle = -Math.PI / 2 + (pct / 100) * 2 * Math.PI;
  const tipX     = C + R * Math.cos(tipAngle);
  const tipY     = C + R * Math.sin(tipAngle);

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

          {/*
           * 火花遮罩：将行进火花限制在彩色弧范围内
           * 与 LiquidProgressBar overflow:hidden 裁剪液体同理
           */}
          {/* SVG glow blur filter — 在 SVG 画布内渲染，不创建 CSS 矩形合成层 */}
          <filter id={gfid} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={SW * 0.55} />
          </filter>

          <mask id={mid}>
            <rect width={D} height={D} fill="black" />
            <circle cx={C} cy={C} r={R}
              fill="none" stroke="white"
              strokeWidth={SW + 4}
              strokeDasharray={cir}
              strokeDashoffset={dashOff}
              transform={`rotate(-90 ${C} ${C})`}
            />
          </mask>
        </defs>

        {/* ① 轨道环（始终灰色衬底） */}
        <circle cx={C} cy={C} r={R}
          fill="none" stroke="#e4e8ee" strokeWidth={SW} />

        {/* ③⁰ 起始点闪烁 — 仅 pct=0 且未冻结时显示，颜色跨交期变红/黄/绿 */}
        {pct === 0 && !paused && (
          <circle
            cx={C} cy={C - R}
            r={SW * 0.55}
            fill={baseC}
            style={{
              animation: 'lrStartDot 3s ease-in-out infinite',
              transformOrigin: `${C}px ${C - R}px`,
            }}
          />
        )}

        {/* ②③ 液体层 — <g> 仅作分组容器，不做位移动画（translateY 会让弧脱离轨道环，不是液体感）
            液态感来自：弧 lrArcBreath 透明度呼吸 + lrLiquid 亮度/饱和度脉冲 + SMIL 火花流动 + 辉光脉冲 */}
        {pct > 0 && (
          <g>
            {/* ② 进度弧（lrArcBreath 透明度呼吸，比色相偏移更清晰可见） */}
            <circle cx={C} cy={C} r={R}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth={SW}
              strokeLinecap="round"
              strokeDasharray={cir}
              strokeDashoffset={dashOff}
              transform={`rotate(-90 ${C} ${C})`}
              style={{
                transition: paused ? 'none' : 'stroke-dashoffset 0.7s cubic-bezier(0.34,1.56,0.64,1)',
                animation: doAnim ? 'lrArcBreath 2.5s ease-in-out infinite' : 'none',
              }}
            />
            {/* ③ 辉光层（模糊描边 + opacity 脉冲，跟随 <g> 同步晃动增强液体感） */}
            {doAnim && (
              <circle cx={C} cy={C} r={R}
                fill="none"
                stroke={baseC}
                strokeWidth={SW + 2}
                strokeLinecap="butt"
                strokeDasharray={cir}
                strokeDashoffset={dashOff}
                transform={`rotate(-90 ${C} ${C})`}
                filter={`url(#${gfid})`}
                style={{
                  animation: 'lrGlow 2s ease-in-out infinite',
                  pointerEvents: 'none',
                }}
              />
            )}
          </g>
        )}

        {/*
         * ④ 行进火花（核心效果，匹配 LiquidProgressBar 的 liquidBarPulse 行进 pulse）
         *
         * 实现方式：SMIL <animate> 直接对 stroke-dashoffset 做数值动画
         *   - strokeDasharray=[sparkLen, cir]：一段短亮弧 + 足够大的间隔
         *   - stroke-dashoffset 从 0 动画到 -arcLen：火花从弧起点（12点钟）匀速行进到弧末端
         *   - mask 保证火花不溢出彩色弧区域
         *
         * 为何不用 CSS + --lr-arc：
         *   CSS @keyframes 中 calc(-1 * var(--lr-arc)) 在部分浏览器不插值（不动画）
         * 为何不用 animateTransform on gradient：
         *   Chrome 对 <linearGradient gradientTransform> 的 SMIL 动画支持有缺陷
         * SMIL <animate> on stroke-dashoffset（数值属性）：跨浏览器可靠 ✓
         */}
        {doAnim && arcLen > sparkLen && (
          <circle cx={C} cy={C} r={R}
            fill="none"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth={SW + 1}
            strokeLinecap="round"
            strokeDasharray={`${sparkLen} ${cir}`}
            transform={`rotate(-90 ${C} ${C})`}
            mask={`url(#${mid})`}
            style={{
              filter: `drop-shadow(0 0 ${Math.round(SW * 0.4)}px rgba(255,255,255,0.8))`,
              pointerEvents: 'none',
            }}
          >
            {/* SMIL animate：stroke-dashoffset 从 0 → -arcLen（火花从弧头走到弧尾） */}
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to={`${-arcLen}`}
              dur="1.8s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* ⑤ 弧尖气泡（仿液体表面张力，匹配 bar 顶端波浪感） */}
        {pct > 2 && pct < 99 && (
          <circle cx={tipX} cy={tipY} r={SW * 0.42}
            fill="white"
            style={{
              transformOrigin: `${tipX}px ${tipY}px`,
              animation: paused ? 'none' : 'lrBubble 1.5s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
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
