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

export const unwrapApiData = <T = unknown>(result: unknown, fallbackMessage: string): T => {
  if (isApiSuccess(result)) return (result as ApiResult<T>).data;
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
