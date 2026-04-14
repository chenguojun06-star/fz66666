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
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { isMobile, isTablet, is4K, modalWidth, tableScrollY } = useMemo(() => {
    const mobile = width < mobileMax;
    const tablet = width >= mobileMax && width < tabletMax;
    const is4KScreen = width >= largeMax;
    const modal = mobile ? '96vw' : is4KScreen ? '50vw' : '60vw';
    const scrollY = mobile ? 260 : is4KScreen ? 600 : 420;
    return { isMobile: mobile, isTablet: tablet, is4K: is4KScreen, modalWidth: modal, tableScrollY: scrollY };
  }, [mobileMax, tabletMax, largeMax, width]);

  return { width, isMobile, isTablet, is4K, modalWidth, tableScrollY };
};
