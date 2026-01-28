import { useEffect, useMemo, useState } from 'react';

type ViewportOptions = {
  mobileMax?: number;
  tabletMax?: number;
  ssrWidth?: number;
};

export const useViewport = (options: ViewportOptions = {}) => {
  const { mobileMax = 768, tabletMax = 1024, ssrWidth = 1200 } = options;
  const [width, setWidth] = useState<number>(() => (typeof window === 'undefined' ? ssrWidth : window.innerWidth));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { isMobile, isTablet, modalWidth, tableScrollY } = useMemo(() => {
    const mobile = width < mobileMax;
    const tablet = width >= mobileMax && width < tabletMax;
    const modal = mobile ? '96vw' : tablet ? '60vw' : '60vw';
    const scrollY = mobile ? 260 : 420;
    return { isMobile: mobile, isTablet: tablet, modalWidth: modal, tableScrollY: scrollY };
  }, [mobileMax, tabletMax, width]);

  return { width, isMobile, isTablet, modalWidth, tableScrollY };
};
