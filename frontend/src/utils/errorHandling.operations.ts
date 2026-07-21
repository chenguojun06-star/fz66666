/**
 * 统一的错误处理和日志系统 - 用户操作结果统一提示工具
 */

import { modal } from '@/utils/antdStatic';
import { OperationResult } from './errorHandling.types';
import { errorHandler } from './errorHandling.handler';

/**
 * 执行一个带完整错误处理的操作
 *
 * @param action 要执行的异步函数
 * @param options 操作配置
 * @returns 操作结果
 *
 * 使用示例：
 *   const result = await executeOperation(
 *     () => api.saveOrder(data),
 *     {
 *       successMsg: '订单保存成功',
 *       errorMsg: '订单保存失败',
 *       showSuccess: true,    // 是否显示成功提示
 *       showError: true,      // 是否显示错误提示
 *       showConfirm: false,   // 是否显示确认对话框
 *       confirmTitle: '确认删除？',
 *       confirmContent: '此操作不可撤销，请确认后继续'
 *     }
 *   );
 */
export async function executeOperation<T = unknown>(
  action: () => Promise<T>,
  options: {
    successMsg?: string;
    errorMsg?: string;
    showSuccess?: boolean;
    showError?: boolean;
    showConfirm?: boolean;
    confirmTitle?: string;
    confirmContent?: string;
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
  } = {}
): Promise<OperationResult<T>> {
  const {
    successMsg = '操作成功',
    errorMsg = '操作失败',
    showSuccess = true,
    showError = true,
    showConfirm = false,
    confirmTitle = '请确认',
    confirmContent = '此操作需要您确认后继续',
    onSuccess,
    onError,
  } = options;

  // 如果需要确认，先显示确认对话框
  if (showConfirm) {
    const confirmed = await new Promise<boolean>((resolve) => {
      modal.confirm({
        title: confirmTitle,
        content: confirmContent,
        okText: '确认',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) {
      return { success: false, message: '用户取消操作' };
    }
  }

  try {
    const data = await action();
    if (showSuccess) {
      errorHandler.showSuccess(successMsg);
    }
    onSuccess?.(data);
    return {
      success: true,
      data,
      message: successMsg,
    };
  } catch (error) {
    const handledMsg = showError ? errorHandler.handleError(error, errorMsg) : errorMsg;
    onError?.(error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      message: handledMsg,
    };
  }
}

/**
 * 带重试机制的操作执行
 *
 * @param action 要执行的异步函数
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试延迟（毫秒）
 */
export async function executeWithRetry<T = unknown>(
  action: (attempt: number) => Promise<T>,
  maxRetries = 2,
  retryDelay = 1000
): Promise<OperationResult<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await action(attempt);
      if (attempt > 0) {
        errorHandler.showSuccess(`重试成功（第${attempt + 1}次尝试）`);
      }
      return {
        success: true,
        data,
        message: '操作成功',
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        errorHandler.showWarning(`第${attempt + 1}次尝试失败，${Math.round(retryDelay / 1000)}秒后自动重试...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  const traceId = errorHandler.handleError(lastError, `操作失败，已重试${maxRetries}次`);
  return {
    success: false,
    error: lastError instanceof Error ? lastError : new Error(String(lastError)),
    message: '操作失败',
    traceId,
  };
}

/**
 * 检查操作结果并执行回调
 *
 * 使用示例：
 *   const result = await executeOperation(...);
 *   ifResultOk(result, () => navigate('/list'));
 */
export function ifResultOk<T>(result: OperationResult<T>, onSuccess: (data: T) => void): void {
  if (result.success && result.data !== undefined) {
    onSuccess(result.data);
  }
}

/**
 * 检查操作结果并执行成功或失败回调
 */
export function handleResult<T>(
  result: OperationResult<T>,
  onSuccess: (data: T) => void,
  onError?: (error: Error) => void
): void {
  if (result.success && result.data !== undefined) {
    onSuccess(result.data);
  } else if (result.error && onError) {
    onError(result.error);
  }
}
