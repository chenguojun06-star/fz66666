/**
 * 统一日志工具
 * 生产环境自动禁用debug和info日志
 */

const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
const isDev = Boolean(metaEnv?.DEV);

export const logger = {
  /**
   * 调试日志（仅开发环境）
   */
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`%c[DEBUG] ${message}`, 'color: #888', ...args);
    }
  },

  /**
   * 信息日志（仅开发环境）
   */
  info: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`%c[INFO] ${message}`, 'color: #0066cc', ...args);
    }
  },

  /**
   * 警告日志（所有环境）
   */
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  /**
   * 错误日志（所有环境）
   */
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};

export default logger;
