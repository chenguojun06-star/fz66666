import { useState, useCallback } from 'react';
import api, { type ApiResult } from '@/utils/api';
import type {
  MergeGroup,
  MergeResult,
  GiftRule,
  GiftMatch,
} from './types';
import { extractApiData } from './utils';

export function useOrderProcessing() {
  const [mergeGroups, setMergeGroups] = useState<MergeGroup[]>([]);
  const [giftRules, setGiftRules] = useState<GiftRule[]>([]);

  const fetchMergeCandidates = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<MergeGroup[]>>('/ecommerce/merge-candidates');
      setMergeGroups(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const mergeOutbound = useCallback(async (orderIds: number[], trackingNo: string, expressCompany: string) => {
    const res = await api.post<ApiResult<MergeResult>>('/ecommerce/merge-outbound',
      { orderIds, trackingNo, expressCompany });
    await fetchMergeCandidates();
    return res?.data;
  }, [fetchMergeCandidates]);

  const fetchGiftRules = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<GiftRule[]>>('/ecommerce/gift-rules');
      setGiftRules(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const saveGiftRule = useCallback(async (rule: GiftRule) => {
    await api.post('/ecommerce/gift-rules', rule);
    await fetchGiftRules();
  }, [fetchGiftRules]);

  const deleteGiftRule = useCallback(async (id: number) => {
    await api.delete(`/ecommerce/gift-rules/${id}`);
    await fetchGiftRules();
  }, [fetchGiftRules]);

  const matchGifts = useCallback(async (orderAmount?: number, orderQuantity?: number, platformCode?: string) => {
    const res = await api.post<ApiResult<GiftMatch[]>>('/ecommerce/gift-rules/match',
      { orderAmount, orderQuantity, platformCode });
    return extractApiData(res, []);
  }, []);

  return {
    mergeGroups, giftRules,
    fetchMergeCandidates, mergeOutbound,
    fetchGiftRules, saveGiftRule, deleteGiftRule, matchGifts,
  };
}
