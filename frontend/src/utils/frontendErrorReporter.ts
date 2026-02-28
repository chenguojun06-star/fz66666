/**
 * 前端异常自动上报工具 (独立模块)
 *
 * 拦截以下三类异常并上报到后端 POST /api/system/frontend-errors/report：
 *   1. window.onerror               —— JS 运行时错误（页面崩溃、null 引用...）
 *   2. window.onunhandledrejection  —— 未捕获的 Promise 异常
 *   3. React ErrorBoundary 手动调用  —— React 渲染树崩溃
 *
 * 设计原则：
 *   - 完全独立，不依赖任何业务逻辑
 *   - 上报失败静默处理，绝不影响业务流程
 *   - 短时去重：同一错误消息 10 秒内只上报一次
 *   - 用户未登录时跳过（避免 401 噪音）
 */

const REPORT_URL = '/api/system/frontend-errors/report';
const DEBOUNCE_MS = 10_000; // 10 秒内相同消息不重复上报
const recentKeys = new Map<string, number>();

function dedup(key: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(key) ?? 0;
  if (now - last < DEBOUNCE_MS) return true; // 重复，跳过
  recentKeys.set(key, now);
  // 防内存泄漏：超过 50 条时清空旧记录
  if (recentKeys.size > 50) {
    const cutoff = now - DEBOUNCE_MS;
    for (const [k, v] of recentKeys) {
      if (v < cutoff) recentKeys.delete(k);
    }
  }
  return false;
}

function report(type: string, message: string, stack?: string) {
  const key = `${type}:${message.slice(0, 100)}`;
  if (dedup(key)) return;

  const payload = {
    type,
    message: message.slice(0, 500),
    stack: stack ? stack.slice(0, 2000) : undefined,
    url: window.location.href,
    occurredAt: new Date().toISOString(),
  };

  // 使用 fetch 而非 axios，避免循环依赖；fetch 失败静默处理
  fetch(REPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include', // 携带 Cookie/Session
  }).catch(() => {/* 静默 */});
}

/**
 * 初始化全局前端异常上报
 * 在 main.tsx 最顶部调用一次，调用时机：suppressCloudBaseNoise 和 chunk reload 之后
 */
export function initFrontendErrorReporter(): void {
  // 1. JS 运行时错误
  const prevOnerror = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = String(message);
    // 过滤噪音：chunk 加载失败已有处理逻辑，不重复上报
    if (msg.includes('dynamically imported') || msg.includes('Failed to fetch')) {
      return prevOnerror ? prevOnerror(message, source, lineno, colno, error) : false;
    }
    report('error', msg, error?.stack ?? `${source}:${lineno}:${colno}`);
    return prevOnerror ? prevOnerror(message, source, lineno, colno, error) : false;
  };

  // 2. 未捕获的 Promise 异常
  const prevOnunhandled = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? 'UnhandledRejection');
    // 过滤 axios 401/403（业务正常情况）
    if (msg.includes('401') || msg.includes('403') || msg.includes('Request failed with status code 4')) {
      return;
    }
    report('unhandledrejection', msg, reason instanceof Error ? reason.stack : undefined);
    if (prevOnunhandled) prevOnunhandled.call(window, event);
  };
}

/**
 * 供 React ErrorBoundary 手动调用
 * 使用方式：在 componentDidCatch(error, info) 中调用此函数
 */
export function reportReactError(error: Error, componentStack?: string): void {
  report('react', error.message, (error.stack ?? '') + '\n' + (componentStack ?? ''));
}
