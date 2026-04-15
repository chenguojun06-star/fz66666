import { useMemo } from 'react';

export function useWechatEnv() {
  return useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    return {
      isWechat: /micromessenger/.test(ua),
      isMobile: /iphone|ipad|ipod|android/.test(ua),
    };
  }, []);
}
