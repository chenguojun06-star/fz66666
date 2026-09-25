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

  /**
   * 设备是否具备「悬停指针」（鼠标 / 触控板），而不是触摸屏。
   *
   * 为什么要单独判定：**用窗口宽度推断输入方式是不可靠的**。
   * 桌面用户把窗口拉窄（或分屏）时宽度会小于 768，但那台机器依然是鼠标操作 ——
   * 此时若按 `isMobile` 走触摸逻辑，侧边栏会被强制折叠、子菜单还会从「悬停展开」
   * 退化成「点击展开」，用户会以为悬停功能坏了（2026-09-25 用户报障即此）。
   * 所以「悬停还是点击」这类交互决策必须看**输入能力**，而不是看宽度。
   */
  const [hasHoverPointer, setHasHoverPointer] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

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

  // 外接/拔掉鼠标等情况要能实时跟随（例如平板插上鼠标后应恢复悬停交互）
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = (e: MediaQueryListEvent) => setHasHoverPointer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const { isMobile, isTablet, is4K, isLowRes, modalWidth, tableScrollY } = useMemo(() => {
    const mobile = width < mobileMax;
    const tablet = width >= mobileMax && width < tabletMax;
    const is4KScreen = width >= largeMax;
    const lowRes = width < 1280;
    const modal = mobile ? '96vw' : is4KScreen ? '50vw' : '85vw';
    const scrollY = mobile ? 260 : is4KScreen ? 600 : 420;
    return { isMobile: mobile, isTablet: tablet, is4K: is4KScreen, isLowRes: lowRes, modalWidth: modal, tableScrollY: scrollY };
  }, [mobileMax, tabletMax, largeMax, width]);

  return { width, isMobile, isTablet, is4K, isLowRes, modalWidth, tableScrollY, hasHoverPointer };
};
