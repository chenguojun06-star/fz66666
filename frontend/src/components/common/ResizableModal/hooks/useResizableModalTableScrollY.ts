import React from 'react';

export const useResizableModalTableScrollY = <T extends HTMLElement>(args: {
  open: boolean;
  ref: React.RefObject<T | null>;
  offset?: number;
  minY?: number;
  defaultY?: number;
  watch?: unknown[];
}) => {
  const { open, ref, offset = 56, minY = 180, defaultY = 320, watch = [] } = args;
  const [scrollY, setScrollY] = React.useState<number>(defaultY);
  const rafIdRef = React.useRef<number | null>(null);
  const computedRef = React.useRef<number>(defaultY);

  React.useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;

    const compute = (entryHeight?: number) => {
      const h = Math.floor(entryHeight ?? (el.getBoundingClientRect().height || 0));
      const y = Math.max(minY, h - offset);
      if (computedRef.current === y) return;
      computedRef.current = y;
      setScrollY(y);
    };

    const onWindowResize = () => compute();

    compute();

    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') return;
      window.addEventListener('resize', onWindowResize);
      return () => window.removeEventListener('resize', onWindowResize);
    }

    const ro = new ResizeObserver((entries) => {
      if (rafIdRef.current !== null) return;
      const entry = entries[0];
      const entryHeight = entry?.contentRect?.height
        ?? entry?.borderBoxSize?.[0]?.blockSize
        ?? el.getBoundingClientRect().height;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        compute(entryHeight);
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref, offset, minY, ...watch]);

  return scrollY;
};
