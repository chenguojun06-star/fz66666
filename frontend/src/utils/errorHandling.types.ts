/**
 * 统一的错误处理和日志系统 - 类型定义
 */

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
 * 操作结果
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  message: string;
  traceId?: string;
}
