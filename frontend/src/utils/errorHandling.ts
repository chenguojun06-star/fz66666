/**
 * 统一的错误处理和日志系统
 *
 * 本文件为 re-export 入口，实际实现已按职责拆分至：
 * - errorHandling.types.ts     类型定义（ErrorType / LogLevel / OperationResult）
 * - errorHandling.helpers.ts   纯工具函数（generateTraceId / getTimestamp）
 * - errorHandling.logger.ts    Logger 类 + logger 实例
 * - errorHandling.handler.ts   ErrorHandler 类 + errorHandler 实例
 * - errorHandling.operations.ts 操作结果工具（executeOperation 等）
 *
 * 外部 import 路径保持不变：`@/utils/errorHandling`
 */

export { logger } from './errorHandling.logger';
export { errorHandler } from './errorHandling.handler';
export type { OperationResult } from './errorHandling.types';
export {
  executeOperation,
  executeWithRetry,
  ifResultOk,
  handleResult,
} from './errorHandling.operations';
