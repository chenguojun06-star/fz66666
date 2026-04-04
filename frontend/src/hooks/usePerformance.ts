/* global IntersectionObserverInit */
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import type React from 'react';

/**
 * 防抖 Hook
 * @param fn 要执行的函数
 * @param wait 等待时间(ms)
 */
export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      fnRef.current(...args);
    }, wait);
  }, [wait]);
}

/**
 * 节流 Hook
 * @param fn 要执行的函数
 * @param wait 等待时间(ms)
 */
export function useThrottle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  const lastTimeRef = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTimeRef.current >= wait) {
      lastTimeRef.current = now;
      fnRef.current(...args);
    }
  }, [wait]);
}

/**
 * 防抖值 Hook
 * @param value 原始值
 * @param wait 等待时间(ms)
 */
export function useDebouncedValue<T>(value: T, wait: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, wait]);

  return debouncedValue;
}

/**
 * 请求缓存 - 避免重复请求
 */
const cacheMap = new Map<string, { data: any; timestamp: number }>();

export function useCachedRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 5 * 60 * 1000
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void } {
  const cached = cacheMap.get(key);
  const [data, setData] = useState<T | null>(() => {
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
      cacheMap.set(key, { data: result, timestamp: Date.now() });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttl]);

  useEffect(() => {
    if (!data) {
      fetchData();
    }
  }, [data, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * 虚拟列表 Hook
 */
export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
): {
  visibleItems: T[];
  startIndex: number;
  offsetY: number;
  setScrollTop: (top: number) => void;
} {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 2,
    items.length
  );

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const offsetY = startIndex * itemHeight;

  return { visibleItems, startIndex, offsetY, setScrollTop };
}

/**
 * 懒加载 Hook - 元素进入视口时加载
 */
export function useLazyLoad(
  options?: IntersectionObserverInit
): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => observer.disconnect();
  }, [options]);

  return [ref, isIntersecting];
}

/**
 * 上一帧值 Hook - 用于动画过渡
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * 强制更新 Hook
 */
export function useForceUpdate(): () => void {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((t) => t + 1), []);
}
