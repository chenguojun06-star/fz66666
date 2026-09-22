/**
 * 统一的错误处理和日志系统 - 纯工具函数
 */

/**
 * 生成追踪 ID
 */
export function generateTraceId(): string {
  // D-513：Math.random().toString(36) 的位数不固定，substr(2, 9) 有时只取到 8 位，
  // 导致 traceId 长度不稳定（单测断言 /^TRC-\d+-\w{9}$/ 偶发失败）。
  // 补零到 9 位，保证定长。
  return `TRC-${Date.now()}-${Math.random().toString(36).substr(2, 9).padEnd(9, '0')}`;
}

/**
 * 获取当前时间戳
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}
