import { useCallback, useRef } from 'react';

export function useDebouncedRefresh(refreshFn: () => void, delay = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallRef = useRef(0);

  const debouncedRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastCallRef.current < delay) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        refreshFn();
      }, delay);
      return;
    }
    lastCallRef.current = now;
    refreshFn();
  }, [refreshFn, delay]);

  return debouncedRefresh;
}

export function useVisibilityRefresh(refreshFn: () => void, delay = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);

  const start = useCallback(() => {
    const handler = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastRefreshRef.current < delay) return;
      lastRefreshRef.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(refreshFn, 300);
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshFn, delay]);

  return { start };
}

export function createPauseableInterval(callback: () => void, intervalMs: number) {
  let timerId: ReturnType<typeof setInterval> | null = null;
  let paused = false;

  const start = () => {
    if (timerId) return;
    paused = false;
    timerId = setInterval(() => {
      if (paused || document.hidden) return;
      callback();
    }, intervalMs);
  };

  const stop = () => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const pause = () => { paused = true; };
  const resume = () => { paused = false; };

  const autoPauseOnHidden = () => {
    const handler = () => {
      if (document.hidden) pause();
      else resume();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  };

  return { start, stop, pause, resume, autoPauseOnHidden };
}
