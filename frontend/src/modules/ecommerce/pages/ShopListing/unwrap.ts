/**
 * 兼容两种响应形态：`{code,data}` 信封（axios 拦截器未解包时）与「直返数据」（已解包）。
 * 用 unknown + 断言实现，避免引入 `any`（前端质量基线只许减少不许增加）。
 */
export function unwrap<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in (res as Record<string, unknown>)) {
    const inner = (res as { data?: unknown }).data;
    if (inner !== undefined && inner !== null) return inner as T;
  }
  return res as T;
}