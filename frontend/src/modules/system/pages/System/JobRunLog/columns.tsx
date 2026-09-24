import React from 'react';
import { Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatDateTime } from '@/utils/datetime';
import {
  JOB_RUN_STATUS_TAG,
  SLOW_DURATION_MS,
  formatDuration,
  toNum,
  type FailureJob,
  type JobRunLog,
  type SlowestJob,
} from './types';

/** 耗时单元格：超过阈值标黄，避免"290242"这种数字被当成正常值划过去 */
const renderDuration = (v?: number | null) => {
  if (v == null) return '-';
  const slow = toNum(v) >= SLOW_DURATION_MS;
  return (
    <span style={{ color: slow ? 'var(--color-warning)' : undefined, fontWeight: slow ? 600 : undefined }}>
      {formatDuration(v)}
    </span>
  );
};

/** 运行记录列表列 */
export const getJobRunColumns = (): ColumnsType<JobRunLog> => [
  {
    title: '任务',
    dataIndex: 'jobName',
    key: 'jobName',
    width: 220,
    ellipsis: true,
    render: (v: string) => (
      <Tooltip title={v}>
        <span style={{ fontWeight: 600 }}>{v || '-'}</span>
      </Tooltip>
    ),
  },
  {
    title: '触发方法',
    dataIndex: 'methodName',
    key: 'methodName',
    width: 190,
    ellipsis: true,
    render: (v: string) => (
      <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontSize: 13 }}>{v || '-'}</span>
    ),
  },
  {
    title: '开始时间',
    dataIndex: 'startTime',
    key: 'startTime',
    width: 170,
    render: (v: string) => (v ? formatDateTime(v) : '-'),
  },
  {
    title: '耗时',
    dataIndex: 'durationMs',
    key: 'durationMs',
    width: 110,
    align: 'right' as const,
    render: renderDuration,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 90,
    align: 'center' as const,
    render: (v: string) => {
      const conf = JOB_RUN_STATUS_TAG[v] || { label: v || '-', color: 'default' };
      return <Tag color={conf.color}>{conf.label}</Tag>;
    },
  },
  {
    title: '结果摘要',
    dataIndex: 'resultSummary',
    key: 'resultSummary',
    ellipsis: true,
    render: (v: string) => v || '-',
  },
  {
    title: '错误信息',
    dataIndex: 'errorMessage',
    key: 'errorMessage',
    width: 300,
    ellipsis: true,
    render: (v: string) =>
      v ? (
        <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>}>
          <span style={{ color: 'var(--color-error)' }}>{v}</span>
        </Tooltip>
      ) : (
        <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
      ),
  },
];

/** 最慢任务榜列 */
export const getSlowestJobColumns = (): ColumnsType<SlowestJob> => [
  {
    title: '任务',
    dataIndex: 'jobName',
    key: 'jobName',
    width: 240,
    ellipsis: true,
    render: (v: string) => <span style={{ fontWeight: 600 }}>{v || '-'}</span>,
  },
  {
    title: '触发方法',
    dataIndex: 'methodName',
    key: 'methodName',
    width: 200,
    ellipsis: true,
    render: (v: string) => (
      <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontSize: 13 }}>{v || '-'}</span>
    ),
  },
  { title: '运行次数', dataIndex: 'runs', key: 'runs', width: 100, align: 'right' as const },
  {
    title: '平均耗时',
    dataIndex: 'avgMs',
    key: 'avgMs',
    width: 120,
    align: 'right' as const,
    render: renderDuration,
  },
  {
    title: '最大耗时',
    dataIndex: 'maxMs',
    key: 'maxMs',
    width: 120,
    align: 'right' as const,
    render: renderDuration,
  },
];

/** 失败任务榜列 */
export const getFailureJobColumns = (): ColumnsType<FailureJob> => [
  {
    title: '任务',
    dataIndex: 'jobName',
    key: 'jobName',
    width: 240,
    ellipsis: true,
    render: (v: string) => <span style={{ fontWeight: 600 }}>{v || '-'}</span>,
  },
  {
    title: '触发方法',
    dataIndex: 'methodName',
    key: 'methodName',
    width: 200,
    ellipsis: true,
    render: (v: string) => (
      <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontSize: 13 }}>{v || '-'}</span>
    ),
  },
  {
    title: '失败次数',
    dataIndex: 'failCount',
    key: 'failCount',
    width: 100,
    align: 'right' as const,
    render: (v: number) => <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{v ?? 0}</span>,
  },
  {
    title: '最近失败时间',
    dataIndex: 'lastFailTime',
    key: 'lastFailTime',
    width: 170,
    render: (v: string) => (v ? formatDateTime(v) : '-'),
  },
  {
    title: '最近错误',
    dataIndex: 'lastError',
    key: 'lastError',
    ellipsis: true,
    render: (v: string) =>
      v ? (
        <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>}>
          <span style={{ color: 'var(--color-error)' }}>{v}</span>
        </Tooltip>
      ) : (
        '-'
      ),
  },
];
