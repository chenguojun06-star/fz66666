import { useCallback, useRef, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

/**
 * 统一按钮 Loading Hook
 * 用例：
 *   const { loading, run } = useAsyncButtonAction({
 *     action: async () => { await api.delete(item.id); },
 *     onSuccess: () => message.success('已删除'),
 *     onError: (e) => message.error(e.message),
 *   });
 *
 *   <Button loading={loading} onClick={run}>删除</Button>
 */

export function useAsyncButtonAction<T = void>({
  action,
  onSuccess,
  onError,
  onFinally,
}: {
  action: () => Promise<T> | T;
  onSuccess?: (result: T) => void;
  onError?: (error: Error, message?: MessageInstance) => void;
  onFinally?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const setLoadingSafe = useCallback((val: boolean) => {
    if (mountedRef.current) {
      setLoading(val);
    }
  }, []);

  const run = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await action();
      if (onSuccess) onSuccess(result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (onError) {
        onError(err);
      } else {
        console.error('[button-action]', err);
      }
      throw error;
    } finally {
      setLoadingSafe(false);
      if (onFinally) onFinally();
    }
  }, [loading, action, onSuccess, onError, onFinally, setLoadingSafe]);

  return { loading, run };
}
