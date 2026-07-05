import { useState, useEffect, useCallback, useRef } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ApiResult } from '@/utils/api';
import { useAuthState } from '@/utils/AuthContext';

const POLL_INTERVAL = 30_000;
const MAX_BACKOFF = 5 * 60_000;
const MAX_FAIL_COUNT = 5;

export interface AlertItem {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  targetName?: string;
  targetType?: string;
  targetId?: string;
  timestamp: number;
  acknowledged: boolean;
  actionUrl?: string;
}

export interface UseSmartAlertsResult {
  alerts: AlertItem[];
  criticalCount: number;
  warningCount: number;
  totalCount: number;
  acknowledge: (id: string) => void;
  acknowledgeAll: () => void;
  refresh: () => void;
}

const ALERT_TYPE_MAP: Record<string, 'critical' | 'warning' | 'info'> = {
  critical: 'critical',
  warning: 'warning',
  error: 'critical',
  danger: 'critical',
  info: 'info',
  success: 'info',
};

export function useSmartAlerts(): UseSmartAlertsResult {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef = useRef(0);
  const { isAuthenticated } = useAuthState();

  const fetchAlerts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const anomalyRes = await intelligenceApi.detectAnomalies();
      const anomalyData = (anomalyRes?.data as { items?: Array<{ id?: string; severity?: string; title?: string; description?: string; message?: string; targetName?: string; targetType?: string; targetId?: string; timestamp?: number; actionUrl?: string }> } | undefined) ?? undefined;
      const anomalyAlerts: AlertItem[] = [];

      if (anomalyData?.items && Array.isArray(anomalyData.items)) {
        for (const item of anomalyData.items) {
          const alertType = ALERT_TYPE_MAP[item.severity ?? ''] || 'warning';
          anomalyAlerts.push({
            id: `anomaly-${item.id || Date.now()}`,
            type: alertType,
            title: item.title || '系统预警',
            message: item.description || item.message || '',
            targetName: item.targetName,
            targetType: item.targetType,
            targetId: item.targetId,
            timestamp: item.timestamp || Date.now(),
            acknowledged: false,
            actionUrl: item.actionUrl,
          });
        }
      }

      const pendingRes = await intelligenceApi.getMyPendingTasks();
      const pendingData: any[] = Number((pendingRes as ApiResult<any>).code) === 200
        ? ((pendingRes as ApiResult<any>).data as any[])
        : ((pendingRes as ApiResult<any>).data as any[]) ?? (Array.isArray(pendingRes) ? pendingRes : []);

      const pendingAlerts: AlertItem[] = [];
      for (const task of pendingData) {
        const priority = task.priority === 'high' ? 'critical' : task.priority === 'medium' ? 'warning' : 'info';
        pendingAlerts.push({
          id: `task-${task.id || Date.now()}`,
          type: priority as 'critical' | 'warning' | 'info',
          title: task.title || '待处理任务',
          message: task.description || '',
          targetName: task.targetName,
          targetType: task.taskType,
          targetId: task.targetId,
          timestamp: task.createdAt ? new Date(task.createdAt).getTime() : Date.now(),
          acknowledged: task.status === 'completed',
          actionUrl: task.actionUrl,
        });
      }

      const allAlerts = [...anomalyAlerts, ...pendingAlerts]
        .sort((a, b) => {
          const typeOrder = { critical: 0, warning: 1, info: 2 };
          if (typeOrder[a.type] !== typeOrder[b.type]) {
            return typeOrder[a.type] - typeOrder[b.type];
          }
          return b.timestamp - a.timestamp;
        });

      setAlerts(allAlerts);
      failCountRef.current = 0;
    } catch {
      failCountRef.current += 1;
    }
  }, [isAuthenticated]);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (failCountRef.current >= MAX_FAIL_COUNT) return;
    const delay = failCountRef.current === 0
      ? POLL_INTERVAL
      : Math.min(POLL_INTERVAL * Math.pow(2, failCountRef.current - 1), MAX_BACKOFF);
    timerRef.current = setTimeout(() => {
      void fetchAlerts().then(scheduleNext);
    }, delay);
  }, [fetchAlerts]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchAlerts().then(scheduleNext);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchAlerts, scheduleNext, isAuthenticated]);

  const acknowledge = useCallback((id: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === id ? { ...alert, acknowledged: true } : alert
    ));
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAlerts(prev => prev.map(alert => ({ ...alert, acknowledged: true })));
  }, []);

  return {
    alerts,
    criticalCount: alerts.filter(a => a.type === 'critical' && !a.acknowledged).length,
    warningCount: alerts.filter(a => a.type === 'warning' && !a.acknowledged).length,
    totalCount: alerts.filter(a => !a.acknowledged).length,
    acknowledge,
    acknowledgeAll,
    refresh: fetchAlerts,
  };
}

export const ALERT_SCENARIOS = {
  production: {
    critical: [
      '订单逾期',
      '工序中断',
      '物料短缺',
      '质检失败',
      '设备故障',
    ],
    warning: [
      '交期预警',
      '产能不足',
      '人员缺口',
      '返工率上升',
      '库存偏低',
    ],
  },
  warehouse: {
    critical: [
      '物料短缺',
      '库存不足',
      '质检异常',
      '入库失败',
      '批次过期',
    ],
    warning: [
      '库存预警',
      '物料即将过期',
      '库位不足',
      '出入库频繁',
    ],
  },
  finance: {
    critical: [
      '工资计算异常',
      '对账不匹配',
      '发票过期',
      '应收账款逾期',
    ],
    warning: [
      '成本超支',
      '利润下滑',
      '报销异常',
      '回款延迟',
    ],
  },
  style: {
    critical: [
      '样衣开发逾期',
      '纸样版本冲突',
      'BOM缺失',
    ],
    warning: [
      '开发进度缓慢',
      '款式变更频繁',
      '物料待确认',
    ],
  },
};
