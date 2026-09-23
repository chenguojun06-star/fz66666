/**
 * 联动面板数据 Hook
 *
 *  - useEcBrief(productionOrderNo)  生产端看电商动态
 *  - useProductionBrief(orderNo)    销售端看生产动态
 *
 * 设计要点：
 *  1. 模块级短 TTL 缓存（20s）：悬浮卡会在列表里被反复触发，缓存避免重复请求；
 *     缓存的是真实接口响应，不做任何字段加工，因此不影响数据真实性。
 *  2. 失败时保持 data=null 并暴露 error，由 UI 显示"加载失败/暂无关联"，
 *     **不返回兜底假数据**。
 *  3. 卸载后不 setState，避免悬浮卡快速划过时的状态污染。
 */
import { useEffect, useRef, useState } from 'react';
import ecLinkApi, { type EcBrief, type ProductionBrief } from '@/services/ecommerce/ecLinkApi';

const TTL_MS = 20_000;

interface CacheEntry<T> {
  value: T | null;
  ts: number;
}

const ecCache = new Map<string, CacheEntry<EcBrief>>();
const prodCache = new Map<string, CacheEntry<ProductionBrief>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

export interface LinkState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** 生产端 → 电商动态 */
export function useEcBrief(productionOrderNo?: string | null): LinkState<EcBrief> {
  const [state, setState] = useState<LinkState<EcBrief>>(() => {
    if (!productionOrderNo) return { data: null, loading: false, error: null };
    const cached = readCache(ecCache, productionOrderNo);
    return cached === undefined
      ? { data: null, loading: true, error: null }
      : { data: cached, loading: false, error: null };
  });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!productionOrderNo) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = readCache(ecCache, productionOrderNo);
    if (cached !== undefined) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    setState({ data: null, loading: true, error: null });
    ecLinkApi.briefByProductionOrder(productionOrderNo)
      .then(value => {
        ecCache.set(productionOrderNo, { value, ts: Date.now() });
        if (aliveRef.current) setState({ data: value, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (aliveRef.current) {
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : '加载失败',
          });
        }
      });
  }, [productionOrderNo]);

  return state;
}

/** 销售端 → 生产动态 */
export function useProductionBrief(orderNo?: string | null): LinkState<ProductionBrief> {
  const [state, setState] = useState<LinkState<ProductionBrief>>(() => {
    if (!orderNo) return { data: null, loading: false, error: null };
    const cached = readCache(prodCache, orderNo);
    return cached === undefined
      ? { data: null, loading: true, error: null }
      : { data: cached, loading: false, error: null };
  });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!orderNo) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = readCache(prodCache, orderNo);
    if (cached !== undefined) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    setState({ data: null, loading: true, error: null });
    ecLinkApi.productionBrief(orderNo)
      .then(value => {
        prodCache.set(orderNo, { value, ts: Date.now() });
        if (aliveRef.current) setState({ data: value, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (aliveRef.current) {
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : '加载失败',
          });
        }
      });
  }, [orderNo]);

  return state;
}
