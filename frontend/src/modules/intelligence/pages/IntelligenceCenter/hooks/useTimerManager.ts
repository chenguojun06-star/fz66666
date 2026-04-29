import { useCallback, useEffect, useRef } from 'react';

export interface TimerConfig {
  id: string;
  interval: number;
  callback: () => void;
  immediate?: boolean;
}

export function useTimerManager() {
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mountedRef = useRef(true);

  const setIntervalSafe = useCallback((config: TimerConfig) => {
    const { id, interval, callback, immediate } = config;

    if (intervalsRef.current.has(id)) {
      clearInterval(intervalsRef.current.get(id)!);
    }

    if (immediate) {
      callback();
    }

    const timerId = setInterval(() => {
      if (mountedRef.current) callback();
    }, interval);

    intervalsRef.current.set(id, timerId);
    return timerId;
  }, []);

  const setTimeoutSafe = useCallback((id: string, delay: number, callback: () => void) => {
    if (timeoutsRef.current.has(id)) {
      clearTimeout(timeoutsRef.current.get(id)!);
    }

    const timeoutId = setTimeout(() => {
      if (mountedRef.current) callback();
      timeoutsRef.current.delete(id);
    }, delay);

    timeoutsRef.current.set(id, timeoutId);
    return timeoutId;
  }, []);

  const clearIntervalSafe = useCallback((id: string) => {
    if (intervalsRef.current.has(id)) {
      clearInterval(intervalsRef.current.get(id)!);
      intervalsRef.current.delete(id);
    }
  }, []);

  const clearTimeoutSafe = useCallback((id: string) => {
    if (timeoutsRef.current.has(id)) {
      clearTimeout(timeoutsRef.current.get(id)!);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const clearAll = useCallback(() => {
    intervalsRef.current.forEach(timer => clearInterval(timer));
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    intervalsRef.current.clear();
    timeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAll();
    };
  }, [clearAll]);

  return {
    setInterval: setIntervalSafe,
    setTimeout: setTimeoutSafe,
    clearInterval: clearIntervalSafe,
    clearTimeout: clearTimeoutSafe,
    clearAll,
  };
}
