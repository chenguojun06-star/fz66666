import { useEffect, useMemo, useState } from 'react';

type ViewportOptions = {
  mobileMax?: number;
  tabletMax?: number;
  largeMax?: number;
  ssrWidth?: number;
};

export const useViewport = (options: ViewportOptions = {}) => {
  const { mobileMax = 768, tabletMax = 1024, largeMax = 2560, ssrWidth = 1200 } = options;
  const [width, setWidth] = useState<number>(() => (typeof window === 'undefined' ? ssrWidth : window.innerWidth));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const { isMobile, isTablet, is4K, isLowRes, modalWidth, tableScrollY } = useMemo(() => {
    const mobile = width < mobileMax;
    const tablet = width >= mobileMax && width < tabletMax;
    const is4KScreen = width >= largeMax;
    const lowRes = width < 1280;
    const modal = mobile ? '96vw' : is4KScreen ? '50vw' : '60vw';
    const scrollY = mobile ? 260 : is4KScreen ? 600 : 420;
    return { isMobile: mobile, isTablet: tablet, is4K: is4KScreen, isLowRes: lowRes, modalWidth: modal, tableScrollY: scrollY };
  }, [mobileMax, tabletMax, largeMax, width]);

  return { width, isMobile, isTablet, is4K, isLowRes, modalWidth, tableScrollY };
};
