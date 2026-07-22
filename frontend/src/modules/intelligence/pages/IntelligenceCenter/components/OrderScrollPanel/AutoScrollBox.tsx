import React, { useState, useEffect, useRef } from 'react';

export const AutoScrollBox: React.FC<{
  children: React.ReactNode;
  className?: string;
  speed?: number;
}> = ({ children, className = '', speed = 28 }) => {
  const outerRef  = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const rafRef    = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const [showClone, setShowClone] = useState(false);
  const dimsRef   = useRef({ scrollHeight: 0, clientHeight: 0 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const updateDims = () => {
      const sh = el.scrollHeight;
      const ch = el.clientHeight;
      if (dimsRef.current.scrollHeight !== sh || dimsRef.current.clientHeight !== ch) {
        dimsRef.current = { scrollHeight: sh, clientHeight: ch };
        const singleH = sh / (showClone ? 2 : 1);
        const needed = singleH > ch;
        if (needed !== showClone) setShowClone(needed);
      }
    };
    updateDims();
    const ro = new ResizeObserver(updateDims);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showClone]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || !showClone) return;
    const tick = (ts: number) => {
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (!pausedRef.current) {
        const { scrollHeight, clientHeight } = dimsRef.current;
        const halfH = scrollHeight / 2;
        if (halfH > clientHeight) {
          el.scrollTop += speed * delta / 1000;
          if (el.scrollTop >= halfH) el.scrollTop -= halfH;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); lastTsRef.current = 0; };
  }, [speed, showClone]);

  return (
    <div ref={outerRef} className={`c-auto-scroll ${className}`}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; lastTsRef.current = 0; }}
    >
      <div>{children}</div>
      {showClone && <div aria-hidden="true">{children}</div>}
    </div>
  );
};
