import { useState, useCallback } from 'react';
import { message } from 'antd';

/**
 * API 请求配置选项
 */
export interface RequestOptions<T = any> {
  /** 成功回调 */
  onSuccess?: (data?: T) => void;
  /** 错误回调 */
  onError?: (error: any) => void;
  /** 是否手动触发（默认false - 自动执行） */
  manual?: boolean;
}

/**
 * useRequest 返回结果
 */
export interface RequestResult<T = any> {
  /** 执行请求函数 */
  run: () => Promise<T | void>;
  /** 加载状态 */
  loading: boolean;
  /** 请求数据（可选，取决于是否需要缓存） */
  data?: T;
}

/**
 * 通用 API 请求管理 Hook
 * 统一处理：loading状态、错误提示、成功提示
 *
 * @param asyncFn - 异步请求函数
 * @param options - 请求选项
 *
 * @example
 * // 自动执行（组件加载时）
 * const { run: fetchList, loading } = useRequest(async () => {
 *   const res = await api.get('/list');
 *   setDataList(res.data);
 * });
 *
 * // 手动触发（按钮点击时）
 * const { run: handleSubmit, loading: submitLoading } = useRequest(
 *   async () => {
 *     await api.post('/save', form.getFieldsValue());
 *     return '保存成功'; // 返回字符串自动显示成功提示
 *   },
 *   {
 *     onSuccess: () => {
 *       closeModal();
 *       fetchList();
 *     }
 *   }
 * );
 */
export const useRequest = <T = any>(
  asyncFn: () => Promise<T | string | void>,
  options: RequestOptions<T> = {}
): RequestResult<T> => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | undefined>();

  const run = useCallback(async (): Promise<T | void> => {
    setLoading(true);
    try {
      const result = await asyncFn();

      // 如果返回字符串，视为成功提示
      if (typeof result === 'string') {
        message.success(result);
      }

      // 缓存数据（可选）
      if (result && typeof result !== 'string') {
        setData(result as T);
      }

      // 执行成功回调
      options.onSuccess?.(result as T);

      return result as T;
    } catch (error: any) {
      // 自动显示错误提示
      const errorMsg = error?.message || error?.msg || '操作失败';
      message.error(errorMsg);

      // 执行错误回调
      options.onError?.(error);

      throw error; // 重新抛出错误，让调用者可以捕获
    } finally {
      setLoading(false);
    }
  }, [asyncFn, options]);

  return {
    run,
    loading,
    data,
  };
};

