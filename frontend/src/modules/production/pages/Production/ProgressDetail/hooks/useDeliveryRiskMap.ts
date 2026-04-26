/**
 * useDeliveryRiskMap — AI 交期风险数据 Hook
 *
 * 背景加载全部在产订单的 AI 交期风险评估，返回以 orderNo 为 key 的 Map。
 * - 首次加载时在背景静默拉取，不阻塞表格渲染
 * - 模块级 5 分钟缓存，同一页面多个组件共享同一批数据
 * - 接口失败静默处理，fallback 为空 Map
 */
import { useState, useEffect, useRef } from 'react';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ApiResult } from '@/utils/api';

/** 模块级缓存（同页面多次渲染共享） */
let _cachedMap: Map<string, DeliveryRiskItem> | null = null;
let _cacheExpiry = 0;
let _fetchInFlight = false;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 强制清除缓存（手动刷新后调用）
 */
export const clearDeliveryRiskCache = () => {
  _cachedMap = null;
  _cacheExpiry = 0;
};

/**
 * Hook：后台自动拉取 AI 交期风险 Map，以 orderNo 为 key。
 *
 * @param hasActiveOrders 是否有活跃订单（优化：完成页不发请求）
 * @returns Map<orderNo, DeliveryRiskItem>
 */
export const useDeliveryRiskMap = (
  hasActiveOrders: boolean
): Map<string, DeliveryRiskItem> => {
  const [riskMap, setRiskMap] = useState<Map<string, DeliveryRiskItem>>(
    () => _cachedMap ?? new Map()
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!hasActiveOrders) return;

    // 缓存有效则直接使用
    if (_cachedMap && Date.now() < _cacheExpiry) {
      setRiskMap(_cachedMap);
      return;
    }

    // 防止并发重复请求
    if (_fetchInFlight) return;
    _fetchInFlight = true;

    intelligenceApi
      .assessDeliveryRisk()
      .then((res) => {
        const raw = res as ApiResult<{ items?: DeliveryRiskItem[] }>;
        const items = raw?.data?.items ?? (raw as any)?.items ?? [];
        setTimeout(() => {
          const map = new Map<string, DeliveryRiskItem>();
          (items as DeliveryRiskItem[]).forEach((item) => {
            if (item.orderNo) map.set(item.orderNo, item);
          });
          _cachedMap = map;
          _cacheExpiry = Date.now() + CACHE_TTL_MS;
          if (mountedRef.current) setRiskMap(map);
        }, 0);
      })
      .catch(() => {
        // 静默失败，不影响主流程
      })
      .finally(() => {
        _fetchInFlight = false;
      });
  }, [hasActiveOrders]);

  return riskMap;
};
