/**
 * 日志工具
 * 统一封装日志输出，支持生产环境自动禁用调试日志
 */

const { DEBUG } = require('../config/debug');

/**
 * 调试日志（仅在DEBUG模式下输出）
 * @param {...*} args - 日志参数
 */
function debug(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}

/**
 * 信息日志
 * @param {...*} args - 日志参数
 */
function info(...args) {
  console.log('[INFO]', ...args);
}

/**
 * 警告日志
 * @param {...*} args - 日志参数
 */
function warn(...args) {
  console.warn('[WARN]', ...args);
}

/**
 * 错误日志
 * @param {...*} args - 日志参数
 */
function error(...args) {
  console.error('[ERROR]', ...args);
}

/**
 * 性能日志（仅在DEBUG模式下输出）
 * @param {string} label - 性能标记名称
 * @param {Function} fn - 要执行的函数
 * @returns {*} 函数执行结果
 */
function performance(label, fn) {
  if (!DEBUG) {
    return fn();
  }

  const start = Date.now();
  const result = fn();
  const duration = Date.now() - start;
  console.log(`[PERF] ${label}: ${duration}ms`);
  return result;
}

/**
 * 异步性能日志
 * @param {string} label - 性能标记名称
 * @param {Promise} promise - 要执行的Promise
 * @returns {Promise} 原Promise
 */
async function performanceAsync(label, promise) {
  if (!DEBUG) {
    return promise;
  }

  const start = Date.now();
  try {
    const result = await promise;
    const duration = Date.now() - start;
    console.log(`[PERF] ${label}: ${duration}ms`);
    return result;
  } catch (e) {
    const duration = Date.now() - start;
    console.log(`[PERF] ${label}: ${duration}ms (failed)`);
    throw e;
  }
}

module.exports = {
  debug,
  info,
  warn,
  error,
  performance,
  performanceAsync,
};
