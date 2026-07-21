/**
 * 统一的错误处理和日志系统 - 日志管理器
 */

import { LogLevel } from './errorHandling.types';
import { generateTraceId, getTimestamp } from './errorHandling.helpers';

declare const process: { env?: { NODE_ENV?: string } };

/**
 * 日志管理器
 */
export class Logger {
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
