import React, { useMemo } from 'react';
import { Alert, Button, Card, Select, Space, Tabs, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import { useJobRunLogData } from './hooks/useJobRunLogData';
import { getFailureJobColumns, getJobRunColumns, getSlowestJobColumns } from './columns';
import {
  JOB_RUN_DAYS_OPTIONS,
  JOB_RUN_STATUS_OPTIONS,
  formatDuration,
  toNum,
} from './types';

/**
 * 定时任务运行记录（运维页）
 *
 * 背景：`t_ai_job_run_log` 由 JobRunObservabilityAspect 切所有 @Scheduled 方法自动写入，
 * 是**唯一**能回答"某个定时任务今天跑没跑、多久、有没有报错"的地方。
 *
 * 该页此前不存在 —— 后端接口 `GET /api/intelligence/jobs/recent` 从 2026-04-14 起
 * 因误加 `WHERE tenant_id = ?`（而定时任务无用户上下文、tenant_id 恒为 NULL）
 * 一直返回空，且前端从未接入，静默失效 5 个多月（详见 D-542）。
 */
const JobRunLogPage: React.FC = () => {
  const {
    activeTab, setActiveTab,
    status, setStatus,
    days, setDays,
    logs, logsLoading,
    overview, overviewLoading,
    refresh,
  } = useJobRunLogData();

  const listColumns = useMemo(() => getJobRunColumns(), []);
  const slowColumns = useMemo(() => getSlowestJobColumns(), []);
  const failureColumns = useMemo(() => getFailureJobColumns(), []);

  const stats = overview?.stats;
  const failureCount = toNum(stats?.failedRuns);

  const statCards = [
    {
      key: 'total',
      items: [
        { label: `近 ${days} 天运行次数`, value: toNum(stats?.totalRuns), unit: '次', color: 'var(--color-primary)' },
      ],
    },
    {
      key: 'failed',
      items: [
        {
          label: '失败次数',
          value: failureCount,
          unit: '次',
          color: failureCount > 0 ? 'var(--color-error)' : 'var(--color-success)',
        },
      ],
    },
    {
      key: 'jobs',
      items: [{ label: '涉及任务数', value: toNum(stats?.jobCount), unit: '个' }],
    },
    {
      key: 'avg',
      items: [{ label: '平均耗时', value: formatDuration(toNum(stats?.avgMs)) }],
    },
    {
      key: 'max',
      items: [{ label: '最大耗时', value: formatDuration(toNum(stats?.maxMs)) }],
    },
  ];

  const filterBar = (
    <Card className="filter-card mb-sm">
      <Space wrap size={12}>
        <Select
          style={{ width: 130 }}
          value={days}
          options={JOB_RUN_DAYS_OPTIONS}
          onChange={(v) => setDays(v)}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          options={JOB_RUN_STATUS_OPTIONS}
          onChange={(v) => setStatus(v)}
        />
        <Button type="primary" icon={<ReloadOutlined />} loading={logsLoading || overviewLoading} onClick={refresh}>
          刷新
        </Button>
      </Space>
    </Card>
  );

  return (
    <PageLayout title="定时任务运行记录">
      <PageStatCards cards={statCards} activeKey="" />

      <Alert
        type="info"
        showIcon
        className="mb-sm"
        message="这是系统级作业日志：AI 巡检、数据一致性、电商同步等定时任务每次执行都会自动记录。"
        description={
          <span className="u-fs-12">
            定时任务属于系统级作业、不属于任何租户，因此本页展示全部任务的记录（不做租户隔离）。
            成功记录保留 90 天、失败记录保留 365 天（失败信息排障价值更高，故保留更久）。
          </span>
        }
      />

      {filterBar}

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'list' | 'slow' | 'failed')}
        items={[
          {
            key: 'list',
            label: '运行记录',
            children: (
              <ResizableTable
                storageKey="job-run-log-table"
                rowKey={(r) => String(r.id)}
                columns={listColumns}
                dataSource={logs}
                loading={logsLoading}
                pagination={{
                  defaultPageSize: 50,
                  showSizeChanger: true,
                  showTotal: (t) => `共 ${t} 条（最多展示最近 200 条）`,
                }}
                stickyHeader
                scroll={{ x: 'max-content' }}
                showExport
                exportFilename="定时任务运行记录.xlsx"
                emptyDescription="暂无运行记录"
              />
            ),
          },
          {
            key: 'slow',
            label: '最慢任务',
            children: (
              <ResizableTable
                storageKey="job-run-log-slow-table"
                rowKey={(r) => `${r.jobName}-${r.methodName}`}
                columns={slowColumns}
                dataSource={overview?.slowestJobs || []}
                loading={overviewLoading}
                pagination={false}
                stickyHeader
                scroll={{ x: 'max-content' }}
                emptyDescription={`近 ${days} 天暂无运行数据`}
              />
            ),
          },
          {
            key: 'failed',
            label: (
              <span>
                失败任务
                {failureCount > 0 ? <Tag color="red" style={{ marginLeft: 6 }}>{failureCount}</Tag> : null}
              </span>
            ),
            children: (
              <ResizableTable
                storageKey="job-run-log-failed-table"
                rowKey={(r) => `${r.jobName}-${r.methodName}`}
                columns={failureColumns}
                dataSource={overview?.failureTop || []}
                loading={overviewLoading}
                pagination={false}
                stickyHeader
                scroll={{ x: 'max-content' }}
                emptyDescription={`近 ${days} 天没有失败的任务`}
              />
            ),
          },
        ]}
      />
    </PageLayout>
  );
};

export default JobRunLogPage;
