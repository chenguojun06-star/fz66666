import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { App } from 'antd';
import { useUser } from '@/utils/AuthContext';
import { checkPermissionRequirement, type PermissionRequirement } from '@/utils/api/permissionGuard';

export interface RequestOptions<T = any> {
  onSuccess?: (data?: T) => void;
  onError?: (error: any) => void;
  manual?: boolean;
  permission?: PermissionRequirement;
  cache?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
}

export interface RequestResult<T = any> {
  run: () => Promise<T | void>;
  loading: boolean;
  data?: T;
  error?: Error;
  refresh: () => Promise<T | void>;
}

const globalCache = new Map<string, { data: any; expireAt: number }>();

function buildTenantCacheKey(key: string, tenantId: number | string | undefined): string {
  if (tenantId === undefined || tenantId === null) {
    return `no-tenant:${key}`;
  }
  return `tenant:${tenantId}:${key}`;
}

export const useRequest = <T = any>(
  asyncFn: () => Promise<T | string | void>,
  options: RequestOptions<T> = {}
): RequestResult<T> => {
  const { message } = App.useApp();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const hasAutoRun = useRef(false);

  const {
    onSuccess,
    onError,
    manual = false,
    permission,
    cache = false,
    cacheKey,
    cacheTTL = 5 * 60 * 1000,
  } = options;

  const tenantId = user?.tenantId;

  // --- 用 ref 存储回调/选项，避免 run 引用频繁变化导致子组件重渲染 ---
  const asyncFnRef = useRef(asyncFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => { asyncFnRef.current = asyncFn; }, [asyncFn]);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // 租户维度缓存 key（稳定值，仅在 cacheKey/tenantId 变化时重算）
  const tenantCacheKey = useMemo(
    () => (cache && cacheKey ? buildTenantCacheKey(cacheKey, tenantId) : null),
    [cache, cacheKey, tenantId]
  );

  const run = useCallback(async (): Promise<T | void> => {
    // 权限前置拦截
    if (permission) {
      const result = checkPermissionRequirement(user, permission);
      if (!result.allowed) {
        const err = new Error(result.reason || '无权限');
        setError(err);
        message.error(result.reason || '无权限执行此操作');
        onErrorRef.current?.(err);
        return;
      }
    }

    // 缓存命中 → 直接返回，不发请求
    if (tenantCacheKey) {
      const cached = globalCache.get(tenantCacheKey);
      if (cached && cached.expireAt > Date.now()) {
        setData(cached.data as T);
        onSuccessRef.current?.(cached.data as T);
        return cached.data as T;
      }
    }

    setLoading(true);
    setError(undefined);

    try {
      const result = await asyncFnRef.current();

      if (typeof result === 'string') {
        message.success(result);
      }

      if (result && typeof result !== 'string') {
        setData(result as T);
        if (tenantCacheKey) {
          globalCache.set(tenantCacheKey, { data: result, expireAt: Date.now() + cacheTTL });
        }
      }

      onSuccessRef.current?.(result as T);
      return result as T;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'msg' in err ? String((err as Record<string, any>).msg) : '操作失败');
      message.error(errorMsg);
      setError(err as Error);
      onErrorRef.current?.(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, permission, tenantCacheKey, cacheTTL, message]);

  const refresh = useCallback(async (): Promise<T | void> => {
    if (tenantCacheKey) {
      globalCache.delete(tenantCacheKey);
    }
    return run();
  }, [tenantCacheKey, run]);

  useEffect(() => {
    if (!manual && !hasAutoRun.current) {
      hasAutoRun.current = true;
      run();
    }
  }, [manual, run]);

  return {
    run,
    loading,
    data,
    error,
    refresh,
  };
};

export default useRequest;
