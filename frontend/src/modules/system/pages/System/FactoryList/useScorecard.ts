import { useCallback, useState } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SupplierScore } from '@/services/intelligence/intelligenceApi';
import { buildScorecardMap } from './utils';

export function useScorecard() {
  const [scorecardMap, setScorecardMap] = useState<Record<string, SupplierScore>>({});
  const [scorecardLoaded, setScorecardLoaded] = useState(false);
  const [scorecardLoading, setScorecardLoading] = useState(false);

  const loadScorecardOnce = useCallback(async () => {
    if (scorecardLoaded || scorecardLoading) return;
    setScorecardLoading(true);
    try {
      const res = await intelligenceApi.getSupplierScorecard();
      const scores: SupplierScore[] = res?.scores ?? [];
      setScorecardMap(buildScorecardMap(scores));
      setScorecardLoaded(true);
    } catch { /* 静默失败 */ } finally {
      setScorecardLoading(false);
    }
  }, [scorecardLoaded, scorecardLoading]);

  return {
    scorecardMap,
    scorecardLoading,
    loadScorecardOnce,
  };
}
