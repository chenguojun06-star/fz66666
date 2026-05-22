import { useState, useEffect, useCallback } from 'react';
import { getPatrolActionsByTarget, getPatrolSummary, type PatrolAction, type PatrolSummary } from '@/services/intelligenceApi';

interface PatrolRiskMap {
  [orderNo: string]: PatrolAction[];
}

interface UseAiPatrolReturn {
  patrolRiskMap: PatrolRiskMap;
  patrolSummary: PatrolSummary | null;
  loading: boolean;
  fetchForOrders: (orderNos: string[]) => void;
  getOrderRisks: (orderNo: string) => PatrolAction[];
  hasRisks: (orderNo: string) => boolean;
  getHighestSeverity: (orderNo: string) => 'HIGH' | 'MEDIUM' | 'LOW' | null;
}

const RISK_TYPE_LABELS: Record<string, string> = {
  DEADLINE_RISK: '交期风险',
  FACTORY_SILENCE: '工厂沉默',
  QUALITY_SPIKE: '质量异常',
  CORRELATED_RISK: '多重风险',
};

export function useAiPatrol(): UseAiPatrolReturn {
  const [patrolRiskMap, setPatrolRiskMap] = useState<PatrolRiskMap>({});
  const [patrolSummary, setPatrolSummary] = useState<PatrolSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchForOrders = useCallback(async (orderNos: string[]) => {
    if (orderNos.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        orderNos.slice(0, 30).map(async (orderNo) => {
          try {
            const actions = await getPatrolActionsByTarget('order', orderNo, 5);
            return { orderNo, actions: actions.filter(a => a.status === 'PENDING' || a.status === 'APPROVED') };
          } catch {
            return { orderNo, actions: [] as PatrolAction[] };
          }
        })
      );
      const map: PatrolRiskMap = {};
      results.forEach(({ orderNo, actions }) => {
        if (actions.length > 0) {
          map[orderNo] = actions;
        }
      });
      setPatrolRiskMap(prev => ({ ...prev, ...map }));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getPatrolSummary().then(setPatrolSummary).catch(() => {});
  }, []);

  const getOrderRisks = useCallback((orderNo: string) => {
    return patrolRiskMap[orderNo] || [];
  }, [patrolRiskMap]);

  const hasRisks = useCallback((orderNo: string) => {
    return (patrolRiskMap[orderNo]?.length || 0) > 0;
  }, [patrolRiskMap]);

  const getHighestSeverity = useCallback((orderNo: string): 'HIGH' | 'MEDIUM' | 'LOW' | null => {
    const risks = patrolRiskMap[orderNo] || [];
    if (risks.some(r => r.issueSeverity === 'HIGH')) return 'HIGH';
    if (risks.some(r => r.issueSeverity === 'MEDIUM')) return 'MEDIUM';
    if (risks.some(r => r.issueSeverity === 'LOW')) return 'LOW';
    return null;
  }, [patrolRiskMap]);

  return { patrolRiskMap, patrolSummary, loading, fetchForOrders, getOrderRisks, hasRisks, getHighestSeverity };
}

export { RISK_TYPE_LABELS };