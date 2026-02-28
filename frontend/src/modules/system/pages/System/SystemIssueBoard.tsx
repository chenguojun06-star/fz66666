import React, { useState, useCallback } from 'react';
import { Alert, Badge, Button, Card, Col, Empty, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { BugOutlined, CheckCircleOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { systemIssueApi, type SystemIssueItem, type SystemIssueSummary } from '../../../../services/systemStatusService';
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
      <Space direction="vertical" size={2}>
        <Text strong>{record.title}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
        {record.actionHint && (
          <Text type="secondary" style={{ fontSize: 12, color: 'var(--primary-color)' }}>
            💡 {record.actionHint}
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
      t ? <Text style={{ fontSize: 12 }}>{dayjs(t).format('MM-DD HH:mm')}</Text> : <Text type="secondary">-</Text>,
  },
];

export default function SystemIssueBoard() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SystemIssueSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await systemIssueApi.collect();
      // axios 拦截器可能只解包一层（HTTP body = {code,data,message}），也可能两层（直接给 data 内容）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyRaw = raw as any;
      const resolved: SystemIssueSummary =
        typeof anyRaw?.errorCount === 'number' ? anyRaw :   // 已解包
        typeof anyRaw?.data?.errorCount === 'number' ? anyRaw.data : // 未解包
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

  // 首次进入自动加载
  React.useEffect(() => { refresh(); }, [refresh]);

  const errCount  = summary?.errorCount ?? 0;
  const warnCount = summary?.warnCount ?? 0;
  const infoCount = summary?.infoCount ?? 0;

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
              检查时间：{dayjs(summary.checkedAt).format('MM-DD HH:mm:ss')}
            </Text>
          )}
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            立即检查
          </Button>
        </Space>
      </Space>

      {error && (
        <Alert message="检查失败" description={error} type="error" showIcon style={{ marginBottom: 16 }} />
      )}

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Card size="small" style={{ borderColor: errCount > 0 ? '#ff4d4f' : '#d9d9d9' }}>
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
          <Card size="small" style={{ borderColor: warnCount > 0 ? '#faad14' : '#d9d9d9' }}>
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
          <Card size="small">
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

      <Card size="small" title="问题明细">
        <Spin spinning={loading}>
          {summary && (summary.issues ?? []).length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Text type="secondary">🎉 当前无已知问题，系统运行正常</Text>}
            />
          ) : (
            <Table
              dataSource={summary?.issues ?? []}
              columns={columns}
              rowKey={(r) => `${r.category}-${r.title}`}
              pagination={false}
              size="small"
              rowClassName={(record) =>
                record.level === 'ERROR' ? 'issue-row-error' :
                record.level === 'WARN'  ? 'issue-row-warn'  : ''
              }
            />
          )}
        </Spin>
      </Card>

      <style>{`
        .issue-row-error td { background: #fff2f0 !important; }
        .issue-row-warn  td { background: #fffbe6 !important; }
      `}</style>
    </div>
  );
}
