/**
 * 统一的错误处理和日志系统
 */

import { message } from 'antd';

declare const process: { env?: { NODE_ENV?: string } };

// 错误类型
export enum ErrorType {
  Validation = 'VALIDATION',      // 表单验证错误
  Network = 'NETWORK',            // 网络错误
  Server = 'SERVER',              // 服务器错误
  Auth = 'AUTH',                  // 认证错误
  Permission = 'PERMISSION',      // 权限错误
  Business = 'BUSINESS',          // 业务逻辑错误
  Unknown = 'UNKNOWN'             // 未知错误
}

// 日志级别
export enum LogLevel {
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
    data?: any;
    traceId?: string;
  }> = [];

  private maxLogs = 1000;

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: any, traceId?: string) {
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

  debug(message: string, data?: any) {
    this.log(LogLevel.Debug, message, data);
  }

  info(message: string, data?: any) {
    this.log(LogLevel.Info, message, data);
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.Warn, message, data);
  }

  error(message: string, data?: any): string {
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
  handleFormValidationError(error: any): string {
    const errorFields = (error as any)?.errorFields;
    if (errorFields && errorFields.length > 0) {
      const messages = errorFields.map((f: any) => f.errors[0]).filter(Boolean);
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
  handleNetworkError(error: any): string {
    const traceId = logger.error('网络请求失败', error);

    let errorMsg = '网络请求失败，请检查您的网络连接';

    if (error?.code === 'ECONNABORTED') {
      errorMsg = '请求超时，请稍后重试';
    } else if (error?.response?.status === 0) {
      errorMsg = '无法连接到服务器，请检查网络';
    } else if (error?.message?.includes('Network')) {
      errorMsg = '网络连接异常，请检查网络设置';
    }

    message.error(`${errorMsg} (${traceId})`);
    return errorMsg;
  }

  /**
   * 处理 API 错误
   */
  handleApiError(error: any, defaultMsg = '操作失败'): string {
    let errorMsg = defaultMsg;
    let errorType = ErrorType.Unknown;

    if (error?.response) {
      // 服务器返回了错误响应
      const status = error.response.status;
      const data = error.response.data;

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
        errorMsg = '服务器内部错误，请稍后重试';
        errorType = ErrorType.Server;
      } else if (status >= 500) {
        errorMsg = '服务暂时不可用，请稍后重试';
        errorType = ErrorType.Server;
      } else {
        errorMsg = data?.message || `请求失败 (${status})`;
        errorType = ErrorType.Business;
      }
    } else if (error?.request) {
      // 请求已发送但没有收到响应
      errorMsg = '服务器无响应，请检查网络连接';
      errorType = ErrorType.Network;
    } else if (error?.message) {
      errorMsg = error.message;
      errorType = ErrorType.Unknown;
    }

    const traceId = logger.error('API 请求错误', {
      status: error?.response?.status,
      message: errorMsg,
      type: errorType
    });

    message.error(`${errorMsg} (${traceId})`);
    return errorMsg;
  }

  /**
   * 处理业务错误
   */
  handleBusinessError(msg: string, data?: any): string {
    const traceId = logger.error('业务错误', data);
    message.error(`${msg} (${traceId})`);
    return msg;
  }

  /**
   * 通用错误处理
   */
  handleError(error: any, defaultMsg = '操作失败'): string {
    // 判断错误类型并调用相应的处理方法
    if ((error as any)?.errorFields) {
      // 表单验证错误
      return this.handleFormValidationError(error);
    } else if (error?.response || error?.request) {
      // 网络/接口错误
      return this.handleApiError(error, defaultMsg);
    } else if (error?.message) {
      // 其他错误
      const traceId = logger.error(defaultMsg, error);
      message.error(`${defaultMsg} (${traceId})`);
      return error.message;
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
 * 业务操作记录
 */
class OperationLogger {
  private operations: Array<{
    timestamp: string;
    action: string;
    module: string;
    status: 'success' | 'failure';
    duration: number;
    userId?: string;
    details?: any;
    traceId?: string;
  }> = [];

  private maxOperations = 5000;

  /**
   * 记录操作开始
   */
  startOperation(action: string, module: string) {
    const startTime = Date.now();
    const traceId = generateTraceId();

    return {
      traceId,
      action,
      module,
      startTime,

      /**
       * 记录操作成功
       */
      success: (details?: any) => {
        const duration = Date.now() - startTime;
        this.logOperation(action, module, 'success', duration, traceId, details);
        logger.info(`操作成功: ${module}.${action}`, { traceId, duration: `${duration}ms`, ...details });
      },

      /**
       * 记录操作失败
       */
      failure: (error: any) => {
        const duration = Date.now() - startTime;
        this.logOperation(action, module, 'failure', duration, traceId, error);
        logger.error(`操作失败: ${module}.${action}`, { traceId, duration: `${duration}ms`, error });
      }
    };
  }

  private logOperation(
    action: string,
    module: string,
    status: 'success' | 'failure',
    duration: number,
    traceId: string,
    details?: any
  ) {
    const operation = {
      timestamp: getTimestamp(),
      action,
      module,
      status,
      duration,
      traceId,
      details,
      userId: localStorage.getItem('userId') || undefined
    };

    this.operations.push(operation);
    if (this.operations.length > this.maxOperations) {
      this.operations.shift();
    }
  }

  /**
   * 获取操作日志
   */
  getOperations(filter?: { module?: string; action?: string; status?: 'success' | 'failure' }) {
    let result = this.operations;

    if (filter?.module) {
      result = result.filter(op => op.module === filter.module);
    }
    if (filter?.action) {
      result = result.filter(op => op.action === filter.action);
    }
    if (filter?.status) {
      result = result.filter(op => op.status === filter.status);
    }

    return result;
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const total = this.operations.length;
    const success = this.operations.filter(op => op.status === 'success').length;
    const failure = this.operations.filter(op => op.status === 'failure').length;
    const avgDuration = this.operations.length > 0
      ? this.operations.reduce((sum, op) => sum + op.duration, 0) / this.operations.length
      : 0;

    return { total, success, failure, avgDuration };
  }

  /**
   * 清空操作日志
   */
  clear() {
    this.operations = [];
  }

  /**
   * 导出操作日志为 JSON
   */
  exportJson(): string {
    return JSON.stringify(this.operations, null, 2);
  }
}

export const operationLogger = new OperationLogger();

/**
 * 便捷函数：执行异步操作并自动处理错误
 */
export async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  action: string,
  module: string
): Promise<T | null> {
  const opLogger = operationLogger.startOperation(action, module);

  try {
    const result = await operation();
    opLogger.success();
    return result;
  } catch (error) {
    opLogger.failure(error);
    errorHandler.handleError(error, `${module}.${action} 失败`);
    return null;
  }
}
