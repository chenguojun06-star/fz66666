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
      console.log(`%c[TRACE] ${message}`, 'color: var(--color-text-quaternary)', ...args);
    }
  },

  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`%c[DEBUG] ${message}`, 'color: var(--color-text-muted)', ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`%c[INFO] ${message}`, 'color: var(--color-blue-600)', ...args);
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
