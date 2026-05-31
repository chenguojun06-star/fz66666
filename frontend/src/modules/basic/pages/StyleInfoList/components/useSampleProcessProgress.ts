import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import { SAMPLE_PARENT_STAGES } from './styleTableViewUtils';

export interface ProcessNodeInfo {
  id: string;
  name: string;
  processCode?: string;
  progressStage?: string;
  unitPrice?: number;
  completed?: boolean;
}

export interface ProcessStageProgress {
  key: string;
  label: string;
  percent: number;
  subProcesses: ProcessNodeInfo[];
  completedCount: number;
  totalCount: number;
}

export interface SampleProcessProgressData {
  orderId: string | null;
  orderNo: string | null;
  stages: ProcessStageProgress[];
  loading: boolean;
  trackingStats?: Record<string, { completed: number; total: number }>;
  refresh: () => Promise<void>;
  completeProcess: (processCode: string) => Promise<void>;
}

export default function useSampleProcessProgress(
  productionOrderId: string | undefined,
  patternProductionId?: string | undefined,
): SampleProcessProgressData {
  const [loading, setLoading] = useState(false);
  const [workflowNodes, setWorkflowNodes] = useState<ProcessNodeInfo[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [trackingStats, setTrackingStats] = useState<Record<string, { completed: number; total: number }>>({});

  const loadProgress = useCallback(async () => {
    setLoading(true);
    try {
      let nodes: ProcessNodeInfo[] = [];
      let loadedOrderId: string | null = null;
      let loadedOrderNo: string | null = null;
      let scannedNames = new Set<string>();

      if (productionOrderId) {
        const orderRes: any = await api.get(`/production/order/${productionOrderId}`);
        const orderData = orderRes?.data;
        if (orderData) {
          loadedOrderId = orderData.id || null;
          loadedOrderNo = orderData.orderNo || null;

          if (orderData.progressWorkflowJson) {
            try {
              const parsed = JSON.parse(orderData.progressWorkflowJson);
              if (Array.isArray(parsed?.nodes)) {
                nodes = parsed.nodes.map((n: any) => ({
                  id: n.id || n.processCode || '',
                  name: n.name || '',
                  processCode: n.processCode || n.id || '',
                  progressStage: n.progressStage || '',
                  unitPrice: n.unitPrice || 0,
                }));
              }
            } catch { nodes = []; }
          }

          try {
            const statsRes: any = await api.get(`/production/order/${productionOrderId}/board-stats`);
            if (statsRes?.data && typeof statsRes.data === 'object') {
              const stats: Record<string, { completed: number; total: number }> = {};
              for (const [key, val] of Object.entries(statsRes.data as Record<string, unknown>)) {
                const v = val as Record<string, unknown>;
                stats[key] = {
                  completed: Number(v.completed || v.scanned || 0),
                  total: Number(v.total || v.planned || 0),
                };
              }
              setTrackingStats(stats);
            }
          } catch {
            setTrackingStats({});
          }

          try {
            const scanRes: any = await api.get(`/production/scan/list`, {
              params: { orderId: loadedOrderId, pageSize: 200 },
            });
            const records = Array.isArray(scanRes?.data?.records) ? scanRes.data.records : Array.isArray(scanRes?.data) ? scanRes.data : [];
            for (const r of records) {
              if (r.processName && r.success !== false) scannedNames.add(r.processName);
            }
          } catch { /* ignore */ }
        }
      }

      if (patternProductionId && nodes.length === 0) {
        loadedOrderId = null;
        loadedOrderNo = null;
        try {
          const configRes: any = await api.get(`/production/pattern/${patternProductionId}/process-config`);
          const configData = configRes?.data;
          if (Array.isArray(configData) && configData.length > 0) {
            nodes = configData.map((item: any, idx: number) => ({
              id: String(item.sortOrder || idx + 1),
              name: item.processName || item.operationType || '',
              processCode: item.operationType || item.processName || String(idx + 1),
              progressStage: item.progressStage || '',
              unitPrice: Number(item.unitPrice || item.price || 0),
            }));
          }
        } catch { /* ignore */ }

        try {
          const scanRes: any = await api.get(`/production/pattern/${patternProductionId}/scan-records`);
          const records = Array.isArray(scanRes?.data) ? scanRes.data : Array.isArray(scanRes) ? scanRes : [];
          for (const r of records) {
            if (r.processName && r.success !== false) scannedNames.add(r.processName);
          }
        } catch { /* ignore */ }

        setTrackingStats({});
      }

      if (nodes.length === 0) {
        setTrackingStats({});
      }

      const markedNodes = nodes.map((n) => ({
        ...n,
        completed: scannedNames.has(n.name) || scannedNames.has(n.processCode || ''),
      }));
      setWorkflowNodes(markedNodes);
      setOrderId(loadedOrderId);
      setOrderNo(loadedOrderNo);
    } catch {
      setWorkflowNodes([]);
      setTrackingStats({});
    } finally {
      setLoading(false);
    }
  }, [productionOrderId, patternProductionId]);

  useEffect(() => {
    if (productionOrderId || patternProductionId) {
      void loadProgress();
    }
  }, [loadProgress, productionOrderId, patternProductionId]);

  const stages = useMemo<ProcessStageProgress[]>(() => {
    const stageMap = new Map<string, ProcessNodeInfo[]>();
    for (const node of workflowNodes) {
      const stageKey = resolveStageKey(node.progressStage || node.name);
      if (!stageMap.has(stageKey)) stageMap.set(stageKey, []);
      stageMap.get(stageKey)!.push(node);
    }

    return SAMPLE_PARENT_STAGES.map((stage) => {
      const subs = stageMap.get(stage.key) || [];
      let completedCount = 0;
      const totalCount = subs.length;
      for (const sub of subs) {
        if (sub.completed) {
          completedCount++;
        } else {
          const statKey = sub.processCode || sub.name;
          const stat = trackingStats[statKey];
          if (stat && stat.total > 0 && stat.completed >= stat.total) {
            completedCount++;
          }
        }
      }
      const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      return {
        key: stage.key,
        label: stage.label,
        percent,
        subProcesses: subs,
        completedCount,
        totalCount,
      };
    });
  }, [workflowNodes, trackingStats]);

  const completeProcess = useCallback(async (processCode: string) => {
    if (!orderId) return;
    await api.post(`/production/order/${orderId}/quick-scan`, {
      processCode,
      operatorRole: 'PLATE_WORKER',
    });
    await loadProgress();
  }, [orderId, loadProgress]);

  return {
    orderId,
    orderNo,
    stages,
    loading,
    trackingStats,
    refresh: loadProgress,
    completeProcess,
  };
}

const STAGE_KEY_MAP: Record<string, string> = {
  '采购': 'procurement',
  '裁剪': 'cutting',
  '二次工艺': 'secondary',
  '车缝': 'sewing',
  '尾部': 'tail',
  '入库': 'warehousing',
  'procurement': 'procurement',
  'cutting': 'cutting',
  'secondary': 'secondary',
  'sewing': 'sewing',
  'tail': 'tail',
  'warehousing': 'warehousing',
};

function resolveStageKey(name: string): string {
  if (STAGE_KEY_MAP[name]) return STAGE_KEY_MAP[name];
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(STAGE_KEY_MAP)) {
    if (lower.includes(key.toLowerCase()) || lower.includes(val.toLowerCase())) {
      return val;
    }
  }
  return 'tail';
}
