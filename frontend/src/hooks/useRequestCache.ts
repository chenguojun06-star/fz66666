import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

const globalCache = new Map<string, CacheItem<any>>();

export function clearCache(key?: string) {
  if (key) {
    globalCache.delete(key);
  } else {
    globalCache.clear();
  }
}

export function getCache<T>(key: string): T | null {
  const item = globalCache.get(key);
  if (item) {
    return item.data as T;
  }
  return null;
}

export function setCache<T>(key: string, data: T) {
  globalCache.set(key, { data, timestamp: Date.now() });
}

interface UseRequestOptions<T> {
  cacheKey?: string;
  cacheTime?: number;
  initialData?: T | null;
  manual?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseRequestResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  run: () => Promise<void>;
  refresh: () => Promise<void>;
  mutate: (data: T) => void;
}

export function useRequest<T>(
  fetcher: () => Promise<T>,
  options: UseRequestOptions<T> = {}
): UseRequestResult<T> {
  const {
    cacheKey,
    cacheTime = 5 * 60 * 1000,
    initialData = null,
    manual = false,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState<T | null>(() => {
    if (cacheKey) {
      const cached = globalCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cacheTime) {
        return cached.data as T;
      }
    }
    return initialData as T;
  });

  const [loading, setLoading] = useState(!manual && !data);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current();
      setData(result);

      if (cacheKey) {
        globalCache.set(cacheKey, { data: result, timestamp: Date.now() });
      }

      onSuccess?.(result);
    } catch (err) {
      setError(err as Error);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, cacheTime, onSuccess, onError]);

  useEffect(() => {
    if (!manual && !data) {
      fetchData();
    }
  }, [manual, data, fetchData]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
    if (cacheKey) {
      globalCache.set(cacheKey, { data: newData, timestamp: Date.now() });
    }
  }, [cacheKey]);

  return {
    data,
    loading,
    error,
    run: fetchData,
    refresh: fetchData,
    mutate,
  };
}

export function useRequestWithDeps<T, D extends any[]>(
  fetcher: () => Promise<T>,
  deps: D,
  options: UseRequestOptions<T> = {}
): UseRequestResult<T> {
  const [data, setData] = useState<T | null>(options.initialData ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetcherRef.current();
        if (!cancelled) {
          setData(result);
          options.onSuccess?.(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          options.onError?.(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, deps);

  return {
    data,
    loading,
    error,
    run: async () => {},
    refresh: async () => {},
    mutate: setData,
  };
}
