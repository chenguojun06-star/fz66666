import React, { useState, useCallback } from 'react';
import { Alert, Badge, Button, Card, Col, Empty, Row, Space, Spin, Tabs, Tag, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { BugOutlined, CheckCircleOutlined, CodeOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  systemIssueApi, type SystemIssueItem, type SystemIssueSummary,
  frontendErrorApi, type FrontendErrorRecord,
} from '../../../../services/systemStatusService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const LEVEL_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  ERROR: { color: 'error', label: '紧急', icon: <BugOutlined /> },
  WARN:  { color: 'warning', label: '警告', icon: <WarningOutlined /> },
  INFO:  { color: 'processing', label: '提示', icon: <CheckCircleOutlined /> },
};

const CATEGORY_LABEL: Record<string, string> = {
  SCAN: '扫码',
  ORDER: '订单',
  DATABASE: '数据库',
  SYSTEM: '系统',
  FINANCE: '财务',
};

const columns: ColumnsType<SystemIssueItem> = [
  {
    title: '级别',
    dataIndex: 'level',
    key: 'level',
    width: 80,
    render: (level: string) => {
      const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.INFO;
      return <Badge status={cfg.color as 'error' | 'warning' | 'processing'} text={cfg.label} />;
    },
    filters: [
      { text: '紧急', value: 'ERROR' },
      { text: '警告', value: 'WARN' },
      { text: '提示', value: 'INFO' },
    ],
    onFilter: (value, record) => record.level === value,
  },
  {
    title: '类别',
    dataIndex: 'category',
    key: 'category',
    width: 80,
    render: (cat: string) => <Tag>{CATEGORY_LABEL[cat] ?? cat}</Tag>,
  },
  {
    title: '问题描述',
    key: 'desc',
    render: (_: unknown, record: SystemIssueItem) => (
      <Space orientation="vertical" size={2}>
        <Text strong>{record.title}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
        {record.actionHint && (
          <Text type="secondary" style={{ fontSize: 12, color: 'var(--primary-color)' }}>
             {record.actionHint}
          </Text>
        )}
      </Space>
    ),
  },
  {
    title: '数量',
    dataIndex: 'count',
    key: 'count',
    width: 80,
    align: 'center',
    render: (count: number, record: SystemIssueItem) => (
      <Badge
        count={count}
        overflowCount={9999}
        style={{ backgroundColor: record.level === 'ERROR' ? '#ff4d4f' : record.level === 'WARN' ? '#faad14' : '#1677ff' }}
      />
    ),
  },
  {
    title: '最近发生',
    dataIndex: 'lastSeen',
    key: 'lastSeen',
    width: 130,
    render: (t: string | null) =>
      t ? <Text style={{ fontSize: 12 }}>{dayjs(t).format('MM-DD')}</Text> : <Text type="secondary">-</Text>,
  },
];

export default function SystemIssueBoard() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SystemIssueSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 前端异常 Tab 状态
  const [feLoading, setFeLoading] = useState(false);
  const [feErrors, setFeErrors] = useState<FrontendErrorRecord[]>([]);
  const [feError, setFeError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await systemIssueApi.collect();
      const anyRaw = raw as any;
      const resolved: SystemIssueSummary =
        typeof anyRaw?.errorCount === 'number' ? anyRaw :
        typeof anyRaw?.data?.errorCount === 'number' ? anyRaw.data :
        ({} as SystemIssueSummary);
      setSummary({
        errorCount: resolved?.errorCount ?? 0,
        warnCount:  resolved?.warnCount  ?? 0,
        infoCount:  resolved?.infoCount  ?? 0,
        totalCount: resolved?.totalCount ?? 0,
        checkedAt:  resolved?.checkedAt  ?? new Date().toISOString(),
        issues:     Array.isArray(resolved?.issues) ? resolved.issues : [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '接口请求失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFe = useCallback(async () => {
    setFeLoading(true);
    setFeError(null);
    try {
      const raw = await frontendErrorApi.recent(100) as any;
      const list: FrontendErrorRecord[] = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data : [];
      setFeErrors([...list].reverse()); // 最新的排最前
    } catch (e: unknown) {
      setFeError(e instanceof Error ? e.message : '获取失败');
    } finally {
      setFeLoading(false);
    }
  }, []);

  // 首次进入自动加载两个 Tab 的数据
  React.useEffect(() => { refresh(); refreshFe(); }, [refresh, refreshFe]);

  const errCount  = summary?.errorCount ?? 0;
  const warnCount = summary?.warnCount ?? 0;
  const infoCount = summary?.infoCount ?? 0;

  // 前端异常列
  const feColumns: ColumnsType<FrontendErrorRecord> = [
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (t: string) => {
        const map: Record<string, string> = { error: '运行时错误', unhandledrejection: 'Promise异常', react: 'React崩溃' };
        const color: Record<string, string> = { error: 'error', unhandledrejection: 'warning', react: 'error' };
        return <Tag color={color[t] ?? 'default'}>{map[t] ?? t}</Tag>;
      },
    },
    {
      title: '错误信息',
      key: 'msg',
      render: (_: unknown, r: FrontendErrorRecord) => (
        <Space orientation="vertical" size={2} style={{ maxWidth: 500 }}>
          <Text strong style={{ wordBreak: 'break-all' }}>{r.message}</Text>
          <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{r.url}</Text>
          {r.stack && (
            <pre style={{ fontSize: 10, color: '#888', margin: 0, maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {r.stack.slice(0, 400)}
            </pre>
          )}
        </Space>
      ),
    },
    {
      title: '发生时间',
      dataIndex: 'occurredAt',
      width: 130,
      render: (t: string) => <Text style={{ fontSize: 12 }}>{dayjs(t).format('MM-DD')}</Text>,
    },
  ];

  const issueTab = (
    <>
      {error && <Alert title="检查失败" description={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Card style={{ borderColor: errCount > 0 ? '#ff4d4f' : '#d9d9d9' }}>
            <Space>
              <BugOutlined style={{ fontSize: 22, color: errCount > 0 ? '#ff4d4f' : '#aaa' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: errCount > 0 ? '#ff4d4f' : '#aaa' }}>{errCount}</div>
                <div style={{ fontSize: 12, color: '#888' }}>紧急问题</div>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderColor: warnCount > 0 ? '#faad14' : '#d9d9d9' }}>
            <Space>
              <WarningOutlined style={{ fontSize: 22, color: warnCount > 0 ? '#faad14' : '#aaa' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: warnCount > 0 ? '#faad14' : '#aaa' }}>{warnCount}</div>
                <div style={{ fontSize: 12, color: '#888' }}>警告问题</div>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Space>
              <CheckCircleOutlined style={{ fontSize: 22, color: infoCount > 0 ? '#1677ff' : '#aaa' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#1677ff' }}>{infoCount}</div>
                <div style={{ fontSize: 12, color: '#888' }}>提示信息</div>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
      <Card title="问题明细">
        <Spin spinning={loading}>
          {summary && (summary.issues ?? []).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary"> 当前无已知问题，系统运行正常</Text>} />
          ) : (
            <ResizableTable
              dataSource={summary?.issues ?? []}
              columns={columns}
              rowKey={(r) => `${r.category}-${r.title}`}
              pagination={false}
             
              rowClassName={(record) =>
                record.level === 'ERROR' ? 'issue-row-error' :
                record.level === 'WARN'  ? 'issue-row-warn'  : ''
              }
            />
          )}
        </Spin>
      </Card>
    </>
  );

  const feTab = (
    <>
      {feError && <Alert title="获取失败" description={feError} type="error" showIcon style={{ marginBottom: 16 }} />}
      <Card title={`前端 JS 异常（最近 100 条，内存队列 · 重启后清空）`}>
        <Spin spinning={feLoading}>
          {feErrors.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary"> 暂无前端异常记录</Text>} />
          ) : (
            <ResizableTable
              dataSource={feErrors}
              columns={feColumns}
              rowKey={(r, i) => `${r.occurredAt}-${i}`}
              pagination={{ pageSize: 20, showSizeChanger: false }}
             
            />
          )}
        </Spin>
      </Card>
    </>
  );

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Title level={4} style={{ margin: 0 }}>
          <BugOutlined style={{ marginRight: 8, color: errCount > 0 ? '#ff4d4f' : '#1677ff' }} />
          系统问题看板
        </Title>
        <Space>
          {summary && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              检查时间：{dayjs(summary.checkedAt).format('MM-DD')}
            </Text>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => { refresh(); refreshFe(); }} loading={loading || feLoading}>
            立即检查
          </Button>
        </Space>
      </Space>

      <Tabs
        defaultActiveKey="issues"
        items={[
          {
            key: 'issues',
            label: (
              <span>
                <BugOutlined />
                系统问题
                {errCount > 0 && <Badge count={errCount} style={{ marginLeft: 6, backgroundColor: '#ff4d4f' }} />}
              </span>
            ),
            children: issueTab,
          },
          {
            key: 'fe-errors',
            label: (
              <span>
                <CodeOutlined />
                前端异常
                {feErrors.length > 0 && <Badge count={feErrors.length} overflowCount={99} style={{ marginLeft: 6, backgroundColor: '#faad14' }} />}
              </span>
            ),
            children: feTab,
          },
        ]}
      />

      <style>{`
        .issue-row-error td { background: #fff2f0 !important; }
        .issue-row-warn  td { background: #fffbe6 !important; }
      `}</style>
    </div>
  );
}
