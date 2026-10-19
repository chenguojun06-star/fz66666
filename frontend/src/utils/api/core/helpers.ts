import type { ApiResult } from './types';

export const isApiSuccess = (result: unknown): result is ApiResult => {
  return (
    typeof result === 'object' &&
    result !== null &&
    'code' in result &&
    Number((result as ApiResult).code) === 200
  );
};

export const getApiMessage = (result: unknown, fallback: string): string => {
  if (typeof result === 'object' && result !== null && 'message' in result) {
    const msg = String((result as { message: unknown }).message || '').trim();
    return msg || fallback;
  }
  return fallback;
};

/** 是否是「没带 code 字段」的裸值 —— 即已经是业务数据、不是信封。 */
const isBareData = (result: unknown): boolean =>
  !(typeof result === 'object' && result !== null && 'code' in result);

/**
 * 解包 `{code, data, message}` 信封。
 *
 * <p><b>刻意做成幂等的</b>：入参不是信封（没有 code 字段）时**原样返回**，不抛错。
 *
 * <p>原因：项目里长期存在两种约定 —— 部分 service 直接 `return api.get(...)`
 * （把信封丢给调用方），部分 service 自己解包后返回裸数据。
 * 两种并存时，任何一侧重写都可能在另一侧造成**双重解包**，
 * 而双重解包的表现是"恒抛异常 → 被 catch 吞掉 → 数据静默为空"，极难定位。
 *
 * <p>幂等之后：service 层解包了，调用方那个多余的 `unwrapApiData` 就成了空操作，
 * 可以分批迁移而不必一次改完 149 处。真正的失败信封（有 code 且非 200）依旧抛错，
 * 错误可见性没有被削弱。
 */
export const unwrapApiData = <T = unknown>(result: unknown, fallbackMessage: string): T => {
  if (isApiSuccess(result)) return (result as ApiResult<T>).data;
  if (isBareData(result)) return result as T;
  throw new Error(getApiMessage(result, fallbackMessage));
};

export const generateRequestId = () => {
  try {
    const anyCrypto = typeof crypto !== 'undefined' ? (crypto as unknown as any) : undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
      return String(anyCrypto.randomUUID());
    }
  } catch {
    // Intentionally empty
  }
  const t = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2, 10);
  const r2 = Math.random().toString(36).slice(2, 10);
  return `${t}-${r1}-${r2}`;
};

export const toNumberSafe = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toUrlSearchParams = (params: Record<string, unknown>): URLSearchParams => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams;
};

export const withQuery = (path: string, params: Record<string, unknown>): string => {
  const searchParams = toUrlSearchParams(params);
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
};
