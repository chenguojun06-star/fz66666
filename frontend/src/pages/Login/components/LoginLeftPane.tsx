import React from 'react';

const LoginLeftPane: React.FC = () => {
  return (
    <div className="login-left-pane">
      <div className="tech-bg" aria-hidden="true">
        <div className="tech-grid" />
        <div className="tech-glow-center" />
        {/* D-531 缝纫线流：蓝色虚线缓行 + 光点沿线巡游（隐喻多厂协同流水线，克制的科技感） */}
        <svg className="thread-flow" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="thread-path"
            d="M26 12 C 16 18, 12 24, 16 30 C 22 40, 32 46, 34 54 C 36 64, 40 78, 50 90 C 56 96, 74 92, 84 78 C 92 66, 92 54, 86 46 C 80 38, 70 40, 70 34 C 70 26, 76 20, 80 14"
            vectorEffect="non-scaling-stroke"
          />
          <circle className="thread-dot" r="0.6">
            <animateMotion
              dur="16s"
              repeatCount="indefinite"
              path="M26 12 C 16 18, 12 24, 16 30 C 22 40, 32 46, 34 54 C 36 64, 40 78, 50 90 C 56 96, 74 92, 84 78 C 92 66, 92 54, 86 46 C 80 38, 70 40, 70 34 C 70 26, 76 20, 80 14"
            />
          </circle>
          <circle className="thread-dot thread-dot--slow" r="0.45">
            <animateMotion
              dur="23s"
              begin="-9s"
              repeatCount="indefinite"
              keyPoints="1;0"
              keyTimes="0;1"
              calcMode="linear"
              path="M26 12 C 16 18, 12 24, 16 30 C 22 40, 32 46, 34 54 C 36 64, 40 78, 50 90 C 56 96, 74 92, 84 78 C 92 66, 92 54, 86 46 C 80 38, 70 40, 70 34 C 70 26, 76 20, 80 14"
            />
          </circle>
        </svg>
      </div>
      <svg className="pencil-filters u-pos-absolute u-ov-hidden" aria-hidden="true" style={{ width: 0, height: 0 }}>
        <defs>
          <filter id="pencil-texture" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.042 0.022" numOctaves="4" seed="7" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4.5" xChannelSelector="R" yChannelSelector="G" result="warped"/>
            <feGaussianBlur in="warped" stdDeviation="0.25"/>
          </filter>
        </defs>
      </svg>
      <div className="login-garments" aria-hidden="true">
        {/* D-534 重画全部服装手稿：fashion-flat 款式图风格，手绘抖动由 pencil-texture 滤镜统一提供 */}
        <svg className="garment garment-tshirt" viewBox="0 0 100 90" fill="none">
          <path stroke="currentColor" d="M32 14 Q40 10 50 18 Q60 10 68 14 L92 26 L86 40 L72 34 L72 82 Q50 86 28 82 L28 34 L14 40 L8 26 Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M40 14 Q50 22 60 14" strokeWidth="1.4" strokeLinecap="round"/>
          <path stroke="currentColor" d="M30 78 Q50 82 70 78" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
          <path stroke="currentColor" d="M14 36 L28 42" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M86 36 L72 42" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M50 22 L50 78" strokeWidth="0.9" strokeDasharray="4 5" opacity="0.3"/>
        </svg>
        <svg className="garment garment-dress" viewBox="0 0 90 130" fill="none">
          <path stroke="currentColor" d="M34 10 Q45 18 56 10 L66 24 L58 32 L52 52 L74 116 Q45 124 16 116 L38 52 L32 30 L24 24 Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M38 12 Q45 20 52 12" strokeWidth="1.4" strokeLinecap="round"/>
          <path stroke="currentColor" d="M38 52 Q45 55 52 52" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
          <path stroke="currentColor" d="M22 110 Q45 117 68 110" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
          <path stroke="currentColor" d="M45 56 L45 112" strokeWidth="0.9" strokeDasharray="4 5" opacity="0.3"/>
        </svg>
        <svg className="garment garment-shirt" viewBox="0 0 100 115" fill="none">
          <path stroke="currentColor" d="M36 12 L30 22 L14 32 L10 76 L22 80 L30 44 L30 106 Q50 110 70 106 L70 44 L78 80 L90 76 L86 32 L70 22 L64 12 Q50 20 36 12 Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M44 10 L50 20 L56 10" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M50 20 L50 104" strokeWidth="1.1" opacity="0.6"/>
          <circle stroke="currentColor" cx="50" cy="34" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="50" cy="50" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="50" cy="66" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="50" cy="82" r="1.4" strokeWidth="1" opacity="0.6"/>
          <path stroke="currentColor" d="M12 70 L24 74" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M76 74 L88 70" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M32 102 Q50 106 68 102" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
        </svg>
        <svg className="garment garment-coat" viewBox="0 0 100 115" fill="none">
          <path stroke="currentColor" d="M36 10 Q50 16 64 10 L70 24 L88 34 L84 80 L72 78 L72 106 Q50 110 28 106 L28 78 L16 80 L12 34 L30 24 Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M36 10 L50 34 L64 10" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M50 34 L50 106" strokeWidth="1.1" opacity="0.6"/>
          <circle stroke="currentColor" cx="56" cy="44" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="56" cy="58" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="56" cy="72" r="1.4" strokeWidth="1" opacity="0.6"/>
          <path stroke="currentColor" d="M32 72 L42 74" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M58 74 L68 72" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M30 102 Q50 106 70 102" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
        </svg>
        <svg className="garment garment-vest" viewBox="0 0 90 105" fill="none">
          <path stroke="currentColor" d="M32 8 Q45 14 58 8 L68 18 L62 34 L66 96 Q45 102 24 96 L28 34 L22 18 Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M32 8 L40 26 L45 32 L50 26 L58 8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle stroke="currentColor" cx="45" cy="44" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="45" cy="58" r="1.4" strokeWidth="1" opacity="0.6"/>
          <circle stroke="currentColor" cx="45" cy="72" r="1.4" strokeWidth="1" opacity="0.6"/>
          <path stroke="currentColor" d="M27 92 Q45 96 63 92" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
          <path stroke="currentColor" d="M30 26 L34 20" strokeWidth="1.1" strokeDasharray="2 3" strokeLinecap="round" opacity="0.5"/>
          <path stroke="currentColor" d="M60 26 L56 20" strokeWidth="1.1" strokeDasharray="2 3" strokeLinecap="round" opacity="0.5"/>
        </svg>
        <svg className="garment garment-skirt" viewBox="0 0 100 85" fill="none">
          <path stroke="currentColor" d="M29 8 L71 8 L72 18 L28 18 Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M28 18 L18 72 Q50 80 82 72 L72 18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M22 66 Q50 74 78 66" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" opacity="0.55"/>
          <path stroke="currentColor" d="M50 20 L50 72" strokeWidth="0.9" strokeDasharray="4 5" opacity="0.3"/>
          <path stroke="currentColor" d="M38 8 L38 18" strokeWidth="1.1" opacity="0.5"/>
          <path stroke="currentColor" d="M62 8 L62 18" strokeWidth="1.1" opacity="0.5"/>
        </svg>
        <svg className="hanger hanger-1" viewBox="0 0 80 36" fill="none">
          <path stroke="currentColor" d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" strokeWidth="1.2" strokeLinecap="round"/>
          <path stroke="currentColor" d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle stroke="currentColor" cx="42" cy="4" r="1.5" strokeWidth="0.8" opacity="0.5"/>
        </svg>
        <svg className="hanger hanger-2" viewBox="0 0 80 36" fill="none">
          <path stroke="currentColor" d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" strokeWidth="1.2" strokeLinecap="round"/>
          <path stroke="currentColor" d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle stroke="currentColor" cx="42" cy="4" r="1.5" strokeWidth="0.8" opacity="0.5"/>
        </svg>
        <svg className="hanger hanger-3" viewBox="0 0 80 36" fill="none">
          <path stroke="currentColor" d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" strokeWidth="1.2" strokeLinecap="round"/>
          <path stroke="currentColor" d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle stroke="currentColor" cx="42" cy="4" r="1.5" strokeWidth="0.8" opacity="0.5"/>
        </svg>
        <svg className="garment-accessory scissors" viewBox="0 0 50 60" fill="none">
          <circle stroke="currentColor" cx="14" cy="48" r="8" strokeWidth="1.2" strokeLinecap="round"/>
          <circle stroke="currentColor" cx="36" cy="48" r="8" strokeWidth="1.2" strokeLinecap="round"/>
          <path stroke="currentColor" d="M14 40L24 8L26 4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <path stroke="currentColor" d="M36 40L26 8L24 4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle stroke="currentColor" cx="25" cy="38" r="2" strokeWidth="0.8" opacity="0.5"/>
        </svg>
      </div>
            <section className="login-showcase">
        <div className="login-showcase-visual">
          <svg className="diagonal-guide" viewBox="0 0 300 300" fill="none" aria-hidden="true">
            <line x1="260" y1="30" x2="150" y2="150" stroke="currentColor" strokeWidth="0.65" strokeDasharray="4 6" opacity="0.12"/>
            <line x1="150" y1="150" x2="20" y2="260" stroke="currentColor" strokeWidth="0.65" strokeDasharray="4 6" opacity="0.10"/>
            <circle cx="150" cy="150" r="3" stroke="currentColor" strokeWidth="0.4" opacity="0.08"/>
          </svg>
          <div className="login-showcase-copy">
            <div className="login-tag">MARS｜云裳协同管理</div>
            <div className="login-showcase-desc">
              多厂协同 · 实时看板 · 智能预警
            </div>
          </div>
          <div className="tech-core-container">
            <div className="tech-ring ring-1"></div>
            <div className="tech-ring ring-2"></div>
            <div className="tech-halo"></div>
            <div className="tech-core tech-core--cloud">
              <div className="tech-cloud-glow" />
              <div className="tech-cloud">
                <span className="tech-cloud__part tech-cloud__part--left" />
                <span className="tech-cloud__part tech-cloud__part--center" />
                <span className="tech-cloud__part tech-cloud__part--right" />
                <span className="tech-cloud__base" />
                <span className="tech-cloud__eye tech-cloud__eye--left">
                  <span className="tech-cloud__eye-highlight tech-cloud__eye-highlight--left" />
                </span>
                <span className="tech-cloud__eye tech-cloud__eye--right">
                  <span className="tech-cloud__eye-highlight tech-cloud__eye-highlight--right" />
                </span>
                <span className="tech-cloud__smile" />
                <span className="tech-cloud__spark tech-cloud__spark--left" />
                <span className="tech-cloud__spark tech-cloud__spark--right" />
              </div>
            </div>
            <div className="small-ai-badge">AI</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LoginLeftPane;
