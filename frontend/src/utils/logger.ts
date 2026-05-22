/**
 * 统一日志工具
 * 生产环境自动禁用debug和info日志
 */

const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
const isDev = Boolean(metaEnv?.DEV);

let traceEnabled = false;
try {
  traceEnabled = localStorage.getItem('__log_trace__') === '1';
} catch { /* */ }

export const logger = {
  trace: (message: string, ...args: unknown[]) => {
    if (isDev && traceEnabled) {
      console.log(`%c[TRACE] ${message}`, 'color: #aaa', ...args);
    }
  },

  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`%c[DEBUG] ${message}`, 'color: #888', ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`%c[INFO] ${message}`, 'color: #0066cc', ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};

export default logger;
