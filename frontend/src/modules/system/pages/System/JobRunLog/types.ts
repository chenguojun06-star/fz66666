/**
 * 定时任务运行记录 —— 类型与展示工具
 *
 * 数据来源：`t_ai_job_run_log`（由 JobRunObservabilityAspect 切所有 @Scheduled 方法自动写入）
 * 接口：`GET /api/intelligence/jobs/recent`、`GET /api/intelligence/jobs/overview`
 */

/** 单条运行记录（对应后端 AiJobRunLog） */
export interface JobRunLog {
  id: number;
  /** 定时任务是后台线程、无用户上下文，该字段实测恒为 null —— 不要拿它做过滤 */
  tenantId?: number | null;
  /** 任务类名，如 AiPatrolOrchestrator */
  jobName: string;
  /** 触发方法名，如 schedulePatrol */
  methodName?: string | null;
  startTime: string;
  /** 执行耗时（毫秒） */
  durationMs?: number | null;
  /** SUCCESS | FAILED | SKIPPED */
  status: string;
  tenantCount?: number | null;
  /** 执行结果摘要，如"共处理3个租户, 生成5条信号" */
  resultSummary?: string | null;
  /** 失败时的错误信息 */
  errorMessage?: string | null;
  createdAt?: string;
}

/** 近 N 天运行概览 */
export interface JobRunStats {
  /** 总运行次数 */
  totalRuns?: number | string | null;
  /** 失败次数（无数据时后端 SUM 返回 null） */
  failedRuns?: number | string | null;
  /** 跳过次数 */
  skippedRuns?: number | string | null;
  /** 平均耗时 ms */
  avgMs?: number | string | null;
  /** 最大耗时 ms */
  maxMs?: number | string | null;
  /** 涉及任务数 */
  jobCount?: number | string | null;
}

/** 最慢任务一项 */
export interface SlowestJob {
  jobName: string;
  methodName?: string | null;
  runs?: number | string | null;
  avgMs?: number | string | null;
  maxMs?: number | string | null;
}

/** 失败任务一项 */
export interface FailureJob {
  jobName: string;
  methodName?: string | null;
  failCount?: number | string | null;
  lastFailTime?: string | null;
  lastError?: string | null;
}

export interface JobRunOverview {
  days: number;
  stats?: JobRunStats;
  slowestJobs?: SlowestJob[];
  failureTop?: FailureJob[];
}

/** 状态筛选项 */
export const JOB_RUN_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '成功', value: 'SUCCESS' },
  { label: '失败', value: 'FAILED' },
  { label: '跳过', value: 'SKIPPED' },
];

/** 统计天数选项 */
export const JOB_RUN_DAYS_OPTIONS = [
  { label: '近 1 天', value: 1 },
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
];

/** 状态标签配置 */
export const JOB_RUN_STATUS_TAG: Record<string, { label: string; color: string }> = {
  SUCCESS: { label: '成功', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
  SKIPPED: { label: '跳过', color: 'default' },
};

/** 耗时超过该值（ms）视为慢，列表里标黄提醒 */
export const SLOW_DURATION_MS = 5000;

/**
 * 耗时格式化：毫秒 → 人话。
 *
 * 之所以要这个：实测该表里 `XiaoyunModelWarmup.warmup` 平均 874ms、**最大 290242ms**，
 * 直接显示 "290242" 没人看得出那是近 5 分钟。按 分/秒/毫秒 分级显示才看得出异常。
 */
export function formatDuration(ms?: number | null): string {
  if (ms == null || Number.isNaN(Number(ms))) return '-';
  const n = Number(ms);
  if (n < 1000) return `${n} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)} 秒`;
  const min = Math.floor(n / 60_000);
  const sec = Math.round((n % 60_000) / 1000);
  return `${min} 分 ${sec} 秒`;
}

/** 数字安全转换（后端 Map 结果可能是 String/BigDecimal/null） */
export function toNum(v?: number | string | null): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}
