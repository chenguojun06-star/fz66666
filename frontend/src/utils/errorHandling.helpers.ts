/**
 * 统一的错误处理和日志系统 - 纯工具函数
 */

/**
 * 生成追踪 ID
 */
export function generateTraceId(): string {
  return `TRC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取当前时间戳
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}
