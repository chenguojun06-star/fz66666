import { message, modal, notification } from '@/utils/antdStatic';
import React from 'react';
/**
 * 统一的错误处理和日志系统
 */



declare const process: { env?: { NODE_ENV?: string } };

// 错误类型
enum ErrorType {
  Validation = 'VALIDATION',      // 表单验证错误
  Network = 'NETWORK',            // 网络错误
  Server = 'SERVER',              // 服务器错误
  Auth = 'AUTH',                  // 认证错误
  Permission = 'PERMISSION',      // 权限错误
  Business = 'BUSINESS',          // 业务逻辑错误
  Unknown = 'UNKNOWN'             // 未知错误
}

// 日志级别
enum LogLevel {
  Debug = 'DEBUG',
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR'
}

/**
 * 生成追踪 ID
 */
function generateTraceId(): string {
  return `TRC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取当前时间戳
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 日志管理器
 */
class Logger {
  private logs: Array<{
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: unknown;
    traceId?: string;
  }> = [];

  private maxLogs = 1000;

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: unknown, traceId?: string) {
    const timestamp = getTimestamp();
    const logEntry = { timestamp, level, message, data, traceId };

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 开发环境打印到控制台
    const isDev = typeof process !== 'undefined' && process?.env?.NODE_ENV === 'development';
    if (isDev) {
      const prefix = `[${level}${traceId ? ` ${traceId}` : ''}] ${message}`;
      switch (level) {
        case LogLevel.Debug:
          console.log(`%c${prefix}`, 'color: #888', data);
          break;
        case LogLevel.Info:
          console.log(`%c${prefix}`, 'color: #0066cc', data);
          break;
        case LogLevel.Warn:
          console.warn(`%c${prefix}`, 'color: #ff9900', data);
          break;
        case LogLevel.Error:
          console.error(`%c${prefix}`, 'color: #ff0000', data);
          break;
      }
    }
  }

  debug(message: string, data?: unknown) {
    this.log(LogLevel.Debug, message, data);
  }

  info(message: string, data?: unknown) {
    this.log(LogLevel.Info, message, data);
  }

  warn(message: string, data?: unknown) {
    this.log(LogLevel.Warn, message, data);
  }

  error(message: string, data?: unknown): string {
    const traceId = generateTraceId();
    this.log(LogLevel.Error, message, data, traceId);
    return traceId;
  }

  /**
   * 获取所有日志
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clear() {
    this.logs = [];
  }

  /**
   * 获取最近的日志
   */
  getRecent(count = 100) {
    return this.logs.slice(-count);
  }

  /**
   * 导出日志为 JSON
   */
  exportJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new Logger();

/**
 * 错误处理管理器
 */
class ErrorHandler {
  /**
   * 处理表单验证错误
   */
  handleFormValidationError(error: unknown): string {
    const errorFields = (error as { errorFields?: Array<{ errors?: string[] }> })?.errorFields;
    if (Array.isArray(errorFields) && errorFields.length > 0) {
      const messages = errorFields
        .map((f) => (Array.isArray(f?.errors) ? f.errors[0] : undefined))
        .filter(Boolean) as string[];
      const errorMsg = messages.length === 1
        ? messages[0]
        : `表单验证失败：${messages.join('；')}`;

      logger.warn('表单验证失败', { errorFields: messages });
      message.error(errorMsg);
      return errorMsg;
    }
    return '表单验证失败';
  }

  /**
   * 处理网络错误
   */
  handleNetworkError(error: unknown): string {
    const traceId = logger.error('网络请求失败', error);

    let errorMsg = '网络请求失败，请检查您的网络连接';
    const err = error as { code?: string; response?: { status?: number }; message?: string };

    if (err?.code === 'ECONNABORTED') {
      errorMsg = '请求超时，请稍后重试';
    } else if (err?.response?.status === 0) {
      errorMsg = '无法连接到服务器，请检查网络';
    } else if (err?.message?.includes('Network')) {
      errorMsg = '网络连接异常，请检查网络设置';
    }

    message.error(`${errorMsg} (${traceId})`);
    return errorMsg;
  }

  /**
   * 处理 API 错误
   */
  handleApiError(error: unknown, defaultMsg = '操作失败'): string {
    let errorMsg = defaultMsg;
    let errorType = ErrorType.Unknown;
    const err = error as { response?: { status?: number; data?: { message?: string } }; request?: unknown; message?: string };

    if (err?.response) {
      // 服务器返回了错误响应
      const status = typeof err.response.status === 'number' ? err.response.status : -1;
      const data = err.response.data;

      if (status === 400) {
        errorMsg = data?.message || '请求参数错误';
        errorType = ErrorType.Validation;
      } else if (status === 401) {
        errorMsg = '请登录后继续';
        errorType = ErrorType.Auth;
      } else if (status === 403) {
        errorMsg = '您没有权限执行此操作';
        errorType = ErrorType.Permission;
      } else if (status === 404) {
        errorMsg = '资源不存在';
        errorType = ErrorType.Business;
      } else if (status === 500) {
        errorMsg = data?.message || '服务器开小差了，请稍后重试';
        errorType = ErrorType.Server;
      } else if (status >= 500) {
        errorMsg = '服务暂时不可用，请稍后重试';
        errorType = ErrorType.Server;
      } else {
        errorMsg = data?.message || `请求失败 (${status})`;
        errorType = ErrorType.Business;
      }
    } else if (err?.request) {
      // 请求已发送但没有收到响应
      errorMsg = '服务器无响应，请检查网络连接';
      errorType = ErrorType.Network;
    } else if (err?.message) {
      errorMsg = err.message;
      errorType = ErrorType.Unknown;
    }

    const traceId = logger.error('API 请求错误', {
      status: err?.response?.status,
      message: errorMsg,
      type: errorType
    });

    message.error(`${errorMsg} (${traceId})`);
    return errorMsg;
  }

  /**
   * 判断错误是否可重试
   */
  isRetryableError(error: unknown): boolean {
    const err = error as { response?: { status?: number }; code?: string; message?: string; request?: unknown };
    
    // 网络超时
    if (err?.code === 'ECONNABORTED') return true;
    
    // 5xx 服务器错误
    if (err?.response?.status && err.response.status >= 500) return true;
    
    // 无响应（网络问题）
    if (err?.request && !err?.response) return true;
    
    // 网络连接错误
    if (err?.message?.includes('Network') || err?.message?.includes('网络')) return true;
    
    return false;
  }

  /**
   * 获取错误类型
   */
  getErrorType(error: unknown): ErrorType {
    const err = error as { response?: { status?: number }; request?: unknown; errorFields?: unknown };
    
    if (err?.errorFields) return ErrorType.Validation;
    
    if (err?.response?.status) {
      const status = err.response.status;
      if (status === 400) return ErrorType.Validation;
      if (status === 401) return ErrorType.Auth;
      if (status === 403) return ErrorType.Permission;
      if (status >= 500) return ErrorType.Server;
      return ErrorType.Business;
    }
    
    if (err?.request) return ErrorType.Network;
    
    return ErrorType.Unknown;
  }

  /**
   * 带重试按钮的错误通知
   * 
   * @param error 错误对象
   * @param onRetry 重试回调函数
   * @param options 配置选项
   * @returns 错误消息
   */
  showErrorWithRetry(
    error: unknown,
    onRetry?: () => void,
    options: {
      title?: string;
      defaultMsg?: string;
      duration?: number;
    } = {}
  ): string {
    const { title = '操作失败', defaultMsg = '操作失败，请稍后重试', duration = 0 } = options;
    
    let errorMsg = defaultMsg;
    const err = error as { response?: { status?: number; data?: { message?: string } }; code?: string; message?: string };
    const errorType = this.getErrorType(error);
    const retryable = onRetry ? this.isRetryableError(error) : false;
    
    // 根据错误类型获取友好消息
    if (err?.response) {
      const status = err.response.status;
      const data = err.response.data;
      
      if (status === 400) {
        errorMsg = data?.message || '请求参数错误，请检查输入后重试';
      } else if (status === 401) {
        errorMsg = '登录已过期，请重新登录';
      } else if (status === 403) {
        errorMsg = '您没有权限执行此操作，请联系管理员开通权限';
      } else if (status === 404) {
        errorMsg = '请求的资源不存在';
      } else if (status === 500) {
        errorMsg = data?.message || '服务器开小差了，请稍后重试';
      } else if (status && status >= 500) {
        errorMsg = '服务暂时不可用，请稍后重试';
      } else {
        errorMsg = data?.message || `请求失败 (${status})`;
      }
    } else if (err?.code === 'ECONNABORTED') {
      errorMsg = '请求超时，请检查网络后重试';
    } else if (err?.message?.includes('Network') || err?.message?.includes('网络')) {
      errorMsg = '网络连接异常，请检查网络设置';
    } else if (err?.message) {
      errorMsg = err.message;
    }
    
    const traceId = logger.error('操作失败', {
      message: errorMsg,
      type: errorType,
      retryable
    });

    let btn: React.ReactNode | undefined;
    if (retryable) {
      btn = React.createElement(
        'button',
        {
          className: 'ant-btn ant-btn-primary ant-btn-sm',
          onClick: () => {
            notification.destroy(traceId);
            onRetry?.();
          },
        },
        '重试'
      );
    }

    const description = React.createElement(
      'div',
      null,
      React.createElement('div', null, errorMsg),
      React.createElement(
        'div',
        { style: { marginTop: 8, fontSize: 12, color: '#999' } },
        '追踪ID: ',
        traceId
      )
    );

    notification.error({
      key: traceId,
      message: title,
      description,
      btn,
      duration,
    });

    return errorMsg;
  }

  /**
   * 处理业务错误
   */
  handleBusinessError(msg: string, data?: unknown): string {
    const traceId = logger.error('业务错误', data);
    message.error(`${msg} (${traceId})`);
    return msg;
  }

  /**
   * 通用错误处理
   */
  handleError(error: unknown, defaultMsg = '操作失败'): string {
    const err = error as { response?: unknown; request?: unknown; message?: string; errorFields?: unknown };
    // 判断错误类型并调用相应的处理方法
    if (err?.errorFields) {
      // 表单验证错误
      return this.handleFormValidationError(error);
    } else if (err?.response || err?.request) {
      // 网络/接口错误
      return this.handleApiError(error, defaultMsg);
    } else if (err?.message) {
      // 其他错误
      const traceId = logger.error(defaultMsg, error);
      message.error(`${defaultMsg} (${traceId})`);
      return err.message;
    }

    const traceId = logger.error(defaultMsg, error);
    message.error(`${defaultMsg} (${traceId})`);
    return defaultMsg;
  }

  /**
   * 显示成功提示
   */
  showSuccess(msg: string) {
    logger.info('操作成功', { message: msg });
    message.success(msg);
  }

  /**
   * 显示信息提示
   */
  showInfo(msg: string) {
    logger.info('信息', { message: msg });
    message.info(msg);
  }

  /**
   * 显示警告提示
   */
  showWarning(msg: string) {
    logger.warn('警告', { message: msg });
    message.warning(msg);
  }
}

export const errorHandler = new ErrorHandler();

/**
 * ===== 用户操作结果统一提示工具 =====
 */

/**
 * 操作结果
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  message: string;
  traceId?: string;
}

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
