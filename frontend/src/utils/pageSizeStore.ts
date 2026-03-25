/**
 * 分页条数持久化工具
 *
 * 以当前路由路径（window.location.pathname）为 key，
 * 在 localStorage 中保存用户每次选择的每页条数，
 * 下次访问同一页面时自动恢复。
 *
 * 使用场景：
 *   - 页面 useState 初始化：pageSize: readPageSize(20)
 *   - ResizableTable 拦截 onChange 时自动调用 savePageSize
 */

const KEY_PREFIX = 'ps:';
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_PAGE_SIZE_OPTIONS = ['20', '50', '100', '200'] as const;

function resolveDefaultPageSize(defaultVal: number): number {
  return Number.isFinite(defaultVal) && defaultVal > 0
    ? defaultVal
    : DEFAULT_PAGE_SIZE;
}

export function normalizePageSize(size: number, defaultVal = DEFAULT_PAGE_SIZE): number {
  const fallback = resolveDefaultPageSize(defaultVal);
  if (!Number.isFinite(size) || size <= 0) {
    return fallback;
  }
  return size;
}

function getKey(): string {
  try {
    return KEY_PREFIX + window.location.pathname;
  } catch {
    return KEY_PREFIX + '/';
  }
}

/**
 * 读取当前页面保存的每页条数
 * @param defaultVal 默认每页条数（用户首次访问时使用）
 */
export function readPageSize(defaultVal: number): number {
  const fallback = resolveDefaultPageSize(defaultVal);
  try {
    const raw = localStorage.getItem(getKey());
    const n = raw ? parseInt(raw, 10) : NaN;
    return normalizePageSize(n, fallback);
  } catch {
    return fallback;
  }
}

/**
 * 保存当前页面的每页条数
 * @param size 用户选择的每页条数
 */
export function savePageSize(size: number): void {
  try {
    localStorage.setItem(getKey(), String(normalizePageSize(size)));
  } catch {
    // localStorage 不可用时静默忽略
  }
}
