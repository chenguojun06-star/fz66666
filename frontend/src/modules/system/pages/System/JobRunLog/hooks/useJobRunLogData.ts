import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useUser } from '@/utils/AuthContext';
import type { JobRunLog, JobRunOverview } from '../types';

/**
 * 定时任务运行记录页面的数据 Hook。
 *
 * 说明：本页是"看系统级定时任务有没有正常跑"的运维页，
 * 数据源是 `t_ai_job_run_log`（所有 @Scheduled 方法执行后自动落一行）。
 *
 * D-748：后端 `/intelligence/jobs/*` 仅限 ROLE_SUPER_ADMIN（D-542 的原设计），
 * 本页也已标为超管专属菜单（菜单隐藏 + 路由守卫）。这里再加一道请求守卫：
 * 非超管直接跳过，避免产生 403 请求与报错提示（同 CustomerManagement 的既有做法）。
 */
export const useJobRunLogData = () => {
  // 用 user.isSuperAdmin 严格判定，与后端 hasAuthority('ROLE_SUPER_ADMIN')
  // （= t_user.is_super_admin）以及 PrivateRoute / SideMenu 的口径保持一致；
  // 不用 useUser().isSuperAdmin —— 它额外把「无租户的管理员」也算作超管，会放过请求再吃 403。
  const { user } = useUser();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = usePersistentState<'list' | 'slow' | 'failed'>(
    'job-run-log-active-tab',
    'list',
  );
  /** 状态筛选：'' 表示全部 */
  const [status, setStatus] = useState('');
  /** 统计天数（同时作用于概览与两个榜单） */
  const [days, setDays] = usePersistentState<number>('job-run-log-days', 7);

  const [logs, setLogs] = useState<JobRunLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [overview, setOverview] = useState<JobRunOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!isSuperAdmin) return; // 超管专属接口，非超管直接跳过，避免 403 日志噪音
    setLogsLoading(true);
    try {
      const res = await api.get<{ code: number; data: JobRunLog[] }>('/intelligence/jobs/recent', {
        params: { limit: 200, status: status || undefined },
      });
      if (res?.code === 200) {
        setLogs(Array.isArray(res.data) ? res.data : []);
      }
    } catch {
      message.error('获取定时任务运行记录失败');
    } finally {
      setLogsLoading(false);
    }
  }, [status, isSuperAdmin]);

  const fetchOverview = useCallback(async () => {
    if (!isSuperAdmin) return; // 超管专属接口，非超管直接跳过，避免 403 日志噪音
    setOverviewLoading(true);
    try {
      const res = await api.get<{ code: number; data: JobRunOverview }>('/intelligence/jobs/overview', {
        params: { days },
      });
      if (res?.code === 200) {
        setOverview(res.data || null);
      }
    } catch {
      message.error('获取定时任务运行概览失败');
    } finally {
      setOverviewLoading(false);
    }
  }, [days, isSuperAdmin]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useEffect(() => { void fetchOverview(); }, [fetchOverview]);

  const refresh = useCallback(() => {
    void fetchLogs();
    void fetchOverview();
  }, [fetchLogs, fetchOverview]);

  return {
    activeTab, setActiveTab,
    status, setStatus,
    days, setDays,
    logs, logsLoading, fetchLogs,
    overview, overviewLoading, fetchOverview,
    refresh,
  };
};
