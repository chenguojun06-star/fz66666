import React from 'react';

const LoginLeftPane: React.FC = () => {
  return (
    <div className="login-left-pane">
      <div className="tech-bg" aria-hidden="true">
        <div className="tech-grid" />
        <div className="tech-glow-center" />
      </div>
      <svg className="pencil-filters" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <filter id="pencil-texture" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.042 0.022" numOctaves="4" seed="7" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="warped"/>
            <feGaussianBlur in="warped" stdDeviation="0.25"/>
          </filter>
        </defs>
      </svg>
      <div className="login-garments" aria-hidden="true">
        <svg className="garment garment-dress" viewBox="0 0 60 100" fill="none">
          <path d="M24 6C24 6 20 4 18 2L16 0L22 0L26 2L30 1L34 2L38 0L44 0L42 2C40 4 36 6 36 6" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M36 6L38 16L40 24" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M24 6L22 16L20 24" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M20 24L16 44L12 66L14 80L18 90L22 96L30 100L38 96L42 90L46 80L48 66L44 44L40 24" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 24L30 26L38 24" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" strokeLinecap="round"/>
          <path d="M26 6L26 24" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1.5 2" opacity="0.5"/>
          <path d="M34 6L34 24" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1.5 2" opacity="0.5"/>
          <path d="M30 26L30 96" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" opacity="0.3"/>
        </svg>
        <svg className="garment garment-tshirt" viewBox="0 0 80 70" fill="none">
          <path d="M0 18L12 6L20 10L26 8L40 6L54 8L60 10L68 6L80 18" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M68 6L66 14L62 26L66 22" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 6L14 14L18 26L14 22" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M62 26L62 64L18 64L18 26" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18 64L40 66L62 64" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" strokeLinecap="round"/>
          <path d="M40 8L40 64" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" opacity="0.25"/>
          <path d="M34 6C34 4 36 2 40 2C44 2 46 4 46 6" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round"/>
          <path d="M22 30L58 30" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 3" opacity="0.3"/>
        </svg>
        <svg className="garment garment-coat" viewBox="0 0 90 110" fill="none">
          <path d="M32 8L28 2L34 0L40 2L45 0L50 2L56 0L62 2L58 8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M58 8L62 14L70 10L82 20L72 30L66 26" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M32 8L28 14L20 10L8 20L18 30L24 26" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M66 26L66 104L24 104L24 26" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M45 16L45 104" stroke="currentColor" strokeWidth="0.6" strokeDasharray="4 3" opacity="0.5"/>
          <path d="M30 26L60 26" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.4"/>
          <path d="M36 26L36 56" stroke="currentColor" strokeWidth="0.4" opacity="0.4"/>
          <circle cx="36" cy="58" r="1.5" stroke="currentColor" strokeWidth="0.4" opacity="0.4"/>
          <path d="M54 26L54 56" stroke="currentColor" strokeWidth="0.4" opacity="0.4"/>
          <circle cx="54" cy="58" r="1.5" stroke="currentColor" strokeWidth="0.4" opacity="0.4"/>
          <path d="M28 40L38 42" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.3"/>
          <path d="M52 42L62 40" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.3"/>
          <path d="M30 80L60 80" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 3" opacity="0.25"/>
        </svg>
        <svg className="garment garment-skirt" viewBox="0 0 70 70" fill="none">
          <path d="M14 6L18 0L26 2L35 0L44 2L52 0L56 6L54 10" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 6L12 10" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M12 10L16 20L20 34L24 48L22 58L18 66L14 70" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M54 10L58 20L62 34L60 48L58 58L54 66L50 70" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 70L32 68L50 70" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M35 10L35 68" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" opacity="0.25"/>
          <path d="M18 24L52 24" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 3" opacity="0.3"/>
          <path d="M22 40L48 40" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 3" opacity="0.25"/>
          <path d="M20 10L28 12L36 10L44 12L52 10" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1.5 2" opacity="0.4"/>
        </svg>
        <svg className="garment garment-shirt" viewBox="0 0 80 80" fill="none">
          <path d="M28 4L24 0L30 0L34 2L40 0L46 2L50 0L56 0L52 4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M52 4L56 8L64 4L76 14L68 22L62 18" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M28 4L24 8L16 4L4 14L12 22L18 18" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M62 18L62 74L18 74L18 18" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M40 4L40 74" stroke="currentColor" strokeWidth="0.4" strokeDasharray="3 4" opacity="0.3"/>
          <path d="M34 4C34 3 36 1 40 1C44 1 46 3 46 4" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round"/>
          <path d="M36 10L36 18L40 20L44 18L44 10" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="40" cy="14" r="1" stroke="currentColor" strokeWidth="0.4" opacity="0.5"/>
          <path d="M36 24L44 24" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.35"/>
          <path d="M36 32L44 32" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.35"/>
          <path d="M36 40L44 40" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.3"/>
          <path d="M18 74L40 76L62 74" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" strokeLinecap="round"/>
        </svg>
        <svg className="garment garment-vest" viewBox="0 0 70 80" fill="none">
          <path d="M22 4L18 0L24 0L28 2L35 0L42 2L46 0L52 0L48 4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M48 4L52 10L56 6L60 12L56 16" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 4L18 10L14 6L10 12L14 16" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M56 16L54 30L52 50L50 66L48 76L46 80" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 16L16 30L18 50L20 66L22 76L24 80" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M24 80L35 78L46 80" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M28 16L28 70" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
          <path d="M42 16L42 70" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
          <path d="M28 16L42 16" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.4"/>
          <path d="M28 20L42 20" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.3"/>
          <path d="M28 40L42 40" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1.5 2" opacity="0.25"/>
          <path d="M30 24L30 36" stroke="currentColor" strokeWidth="0.3" opacity="0.3"/>
          <circle cx="30" cy="37" r="1.2" stroke="currentColor" strokeWidth="0.3" opacity="0.3"/>
          <path d="M40 24L40 36" stroke="currentColor" strokeWidth="0.3" opacity="0.3"/>
          <circle cx="40" cy="37" r="1.2" stroke="currentColor" strokeWidth="0.3" opacity="0.3"/>
        </svg>
        <svg className="hanger hanger-1" viewBox="0 0 80 36" fill="none">
          <path d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="42" cy="4" r="1.5" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
        </svg>
        <svg className="hanger hanger-2" viewBox="0 0 80 36" fill="none">
          <path d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="42" cy="4" r="1.5" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
        </svg>
        <svg className="hanger hanger-3" viewBox="0 0 80 36" fill="none">
          <path d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="42" cy="4" r="1.5" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
        </svg>
        <svg className="garment-accessory scissors" viewBox="0 0 50 60" fill="none">
          <circle cx="14" cy="48" r="8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <circle cx="36" cy="48" r="8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M14 40L24 8L26 4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M36 40L26 8L24 4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="25" cy="38" r="2" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
        </svg>
      </div>
      <section className="login-showcase">
        <div className="login-showcase-visual">
          <svg className="diagonal-guide" viewBox="0 0 300 300" fill="none" aria-hidden="true">
            <line x1="260" y1="30" x2="150" y2="150" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" opacity="0.12"/>
            <line x1="150" y1="150" x2="20" y2="260" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" opacity="0.10"/>
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
