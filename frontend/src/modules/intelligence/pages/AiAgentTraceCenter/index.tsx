import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Empty, Input, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEFAULT_PAGE_SIZE_OPTIONS, readPageSize, savePageSize } from '@/utils/pageSizeStore';
import Layout from '../../../../components/Layout';
import { intelligenceApi } from '../../../../services/intelligence/intelligenceApi';
import { paths } from '../../../../routeConfig';

type TraceRow = {
  id?: string;
  commandId?: string;
  action?: string;
  status?: string;
  reason?: string;
  resultData?: string;
  errorMessage?: string;
  durationMs?: number;
  createdAt?: string;
  remark?: string;
  targetId?: string;
  executorId?: string;
};

const extractToolName = (action?: string) => action?.startsWith('ai-agent:tool:') ? action.replace('ai-agent:tool:', '') : '';
const extractOrderNo = (row?: TraceRow | null) => {
  const source = `${row?.reason || ''} ${row?.resultData || ''}`;
  const match = source.match(/\b([A-Z]{1,6}\d{6,}|\d{8,})\b/i);
  return match?.[1]?.trim();
};
const buildSuggestion = (row?: TraceRow | null) => {
  if (!row || row.status !== 'FAILED') return '';
  if ((row.action || '').includes('tool_material_doc_receive')) return '建议先回放采购单据识别结果，确认匹配行和数量后再执行自动到货。';
  if ((row.action || '').includes('tool_team_dispatch')) return '建议确认订单号、目标岗位和责任人是否匹配，再重新派单或回写状态。';
  if ((row.action || '').includes('tool_finance_workflow')) return '建议先核对审批状态、付款账户和业务单据是否已准备完成。';
  return '建议先查看失败步骤的参数与错误信息，修正后重新执行。';
};
const buildTraceRoute = (row?: TraceRow | null) => {
  const toolSummary = String(row?.remark || '');
  const targetId = String(row?.targetId || '').trim();
  if (!targetId) return null;
  if (toolSummary.includes('tool_material_reconciliation')) {
    return { label: '物料对账', path: `${paths.materialReconciliation}?keyword=${encodeURIComponent(targetId)}` };
  }
  if (toolSummary.includes('tool_finance_workflow')) {
    return { label: '财务中心', path: `${paths.financeCenter}?keyword=${encodeURIComponent(targetId)}` };
  }
  if (toolSummary.includes('tool_sample_workflow') || toolSummary.includes('tool_style_template')) {
    return /^\d+$/.test(targetId)
      ? { label: '样衣开发详情', path: paths.styleInfoDetail.replace(':id', targetId) }
      : { label: '样衣开发', path: `${paths.styleInfoList}?keyword=${encodeURIComponent(targetId)}` };
  }
  if (toolSummary.includes('tool_sample_loan')) {
    return { label: '样衣库存', path: `${paths.sampleInventory}?styleNo=${encodeURIComponent(targetId)}` };
  }
  if (toolSummary.includes('tool_material_receive') || toolSummary.includes('tool_material_doc_receive')) {
    return { label: '面辅料采购', path: `${paths.materialPurchase}?orderNo=${encodeURIComponent(targetId)}` };
  }
  if (toolSummary.includes('tool_team_dispatch')) {
    return { label: '下单管理', path: `${paths.orderManagementList}?keyword=${encodeURIComponent(targetId)}` };
  }
  return extractOrderNo(row)
    ? { label: '订单查询', path: `${paths.orderManagementList}?keyword=${encodeURIComponent(extractOrderNo(row) || '')}` }
    : null;
};
const exportTraceRows = (rows: TraceRow[]) => {
  const header = ['时间', 'commandId', '状态', '执行人', '目标单据', '工具摘要', '耗时(ms)', '用户指令', '错误信息'];
  const lines = rows.map((item) => [
    item.createdAt || '',
    item.commandId || '',
    item.status || '',
    item.executorId || '',
    item.targetId || '',
    item.remark || '',
    item.durationMs == null ? '' : String(item.durationMs),
    (item.reason || '').replace(/\n/g, ' '),
    (item.errorMessage || '').replace(/\n/g, ' '),
  ]);
  const csv = [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ai-agent-traces-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const statusColor = (status?: string) => {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'error';
  if (status === 'EXECUTING') return 'processing';
  return 'default';
};

const AiAgentTraceCenter: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [keyword, setKeyword] = useState(searchParams.get('commandId') || '');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [executorKeyword, setExecutorKeyword] = useState('');
  const [toolName, setToolName] = useState<string | undefined>(undefined);
  const [failedOnly, setFailedOnly] = useState(false);
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [pageSize, setPageSize] = useState(() => readPageSize(20));
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{ commandId?: string; logs?: TraceRow[]; count?: number } | null>(null);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await intelligenceApi.getAiAgentRecentTraces({
        limit: 50,
        toolName,
        status: failedOnly ? 'FAILED' : status,
        executorKeyword: executorKeyword || undefined,
        startTime: timeRange?.[0] ? timeRange[0].toISOString() : undefined,
        endTime: timeRange?.[1] ? timeRange[1].toISOString() : undefined,
      }) as unknown as { data?: { data?: TraceRow[] } };
      setRows(Array.isArray(resp?.data?.data) ? resp.data?.data || [] : []);
    } finally {
      setLoading(false);
    }
  }, [executorKeyword, failedOnly, status, timeRange, toolName]);

  const openDetail = useCallback(async (commandId?: string) => {
    if (!commandId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const resp = await intelligenceApi.getAiAgentTraceDetail(commandId) as unknown as { data?: { data?: { commandId?: string; logs?: TraceRow[]; count?: number } } };
      setDetail(resp?.data?.data ?? { commandId, logs: [], count: 0 });
      setSearchParams(commandId ? { commandId } : {});
    } finally {
      setDetailLoading(false);
    }
  }, [setSearchParams]);

  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  useEffect(() => {
    const commandId = searchParams.get('commandId');
    if (commandId) {
      void openDetail(commandId);
    }
  }, [openDetail, searchParams]);

  const toolOptions = useMemo(() => Array.from(new Set(rows.map((item) => extractToolName(item.action)).filter(Boolean))).map((item) => ({
    label: item,
    value: item,
  })), [rows]);

  const filteredRows = useMemo(() => rows.filter((item) => {
    if (!keyword.trim()) return true;
    const q = keyword.trim().toLowerCase();
    return [item.commandId, item.reason, item.resultData, item.createdAt, item.remark, item.targetId, item.executorId].some((value) => String(value || '').toLowerCase().includes(q));
  }), [rows, keyword]);

  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <div>
            <h2 className="page-title">AI 执行记录中心</h2>
            <div style={{ color: '#8c8c8c', fontSize: 13 }}>统一查看小云每次执行的 commandId、状态、耗时、工具轨迹与失败信息</div>
          </div>
          <Space>
            <Button onClick={() => navigate(paths.intelligenceCenter)}>返回智能运营中心</Button>
            <Button onClick={() => exportTraceRows(filteredRows)}>导出审计报表</Button>
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => void fetchRecent()} loading={loading}>刷新</Button>
          </Space>
        </div>

        <Card size="small" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Input
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 commandId / 指令 / 时间"
              prefix={<SearchOutlined />}
              style={{ width: 280 }}
            />
            <Select
              allowClear
              placeholder="按状态筛选"
              value={status}
              onChange={setStatus}
              style={{ width: 160 }}
              options={[
                { label: '执行中', value: 'EXECUTING' },
                { label: '成功', value: 'SUCCESS' },
                { label: '失败', value: 'FAILED' },
              ]}
            />
            <Select
              allowClear
              placeholder="按工具名筛选"
              value={toolName}
              onChange={setToolName}
              style={{ width: 220 }}
              options={toolOptions}
            />
            <Input
              allowClear
              value={executorKeyword}
              onChange={(e) => setExecutorKeyword(e.target.value)}
              placeholder="按责任人筛选"
              style={{ width: 180 }}
            />
            <DatePicker.RangePicker
              showTime
              value={timeRange as any}
              onChange={(values) => setTimeRange(values as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
            />
            <Button type={failedOnly ? 'primary' : 'default'} danger={failedOnly} onClick={() => setFailedOnly((prev) => !prev)}>
              仅看失败
            </Button>
            <Button type="primary" onClick={() => void fetchRecent()}>查询</Button>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>共 {filteredRows.length} 条请求</span>
          </Space>
        </Card>

        <Alert
          showIcon
          type={filteredRows.some((item) => item.status === 'FAILED') ? 'warning' : 'info'}
          style={{ marginBottom: 12 }}
          title="追溯范围"
          description={filteredRows.some((item) => item.status === 'FAILED')
            ? '当前结果中包含失败记录，建议优先查看详情中的错误信息、工具参数与补救建议。'
            : '这里展示的是小云 AI 请求主记录。点击“查看详情”后，可看到本次请求的工具调用链、状态、错误信息与耗时。'}
        />

        <Table<TraceRow>
          rowKey={(record) => record.id || record.commandId || Math.random().toString(36)}
          loading={loading}
          dataSource={filteredRows}
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
            onChange: (_page, nextPageSize) => {
              if (!nextPageSize || nextPageSize === pageSize) return;
              savePageSize(nextPageSize);
              setPageSize(nextPageSize);
            },
          }}
          locale={{ emptyText: <Empty description="暂无 AI 执行记录" /> }}
          columns={[
            { title: '时间', dataIndex: 'createdAt', width: 180 },
            { title: 'commandId', dataIndex: 'commandId', width: 240, ellipsis: true },
            { title: '状态', dataIndex: 'status', width: 100, render: (value) => <Tag color={statusColor(value)}>{value || 'UNKNOWN'}</Tag> },
            { title: '责任人', dataIndex: 'executorId', width: 120, ellipsis: true },
            { title: '目标单据', dataIndex: 'targetId', width: 140, ellipsis: true },
            { title: '工具', dataIndex: 'remark', width: 220, ellipsis: true },
            { title: '耗时', dataIndex: 'durationMs', width: 90, render: (value) => typeof value === 'number' ? `${value}ms` : '-' },
            { title: '用户指令', dataIndex: 'reason', ellipsis: true },
            {
              title: '操作',
              key: 'action',
              width: 120,
              render: (_, record) => (
                <Space size={4}>
                  <Button type="link" onClick={() => void openDetail(record.commandId)}>查看详情</Button>
                  {buildTraceRoute(record) ? <Button type="link" onClick={() => navigate(buildTraceRoute(record)!.path)}>{buildTraceRoute(record)!.label}</Button> : null}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        size="large"
        open={detailOpen}
        title="AI 执行轨迹详情"
        onClose={() => {
          setDetailOpen(false);
          setSearchParams({});
        }}
      >
        <Space size={16} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="commandId">{detail?.commandId || '-'}</Descriptions.Item>
            <Descriptions.Item label="轨迹条数">{detail?.count ?? detail?.logs?.length ?? 0}</Descriptions.Item>
            <Descriptions.Item label="相关订单">
              {buildTraceRoute(detail?.logs?.find((item) => item.action?.startsWith('ai-agent:tool:')) || detail?.logs?.[0] || null)
                ? <Button type="link" onClick={() => navigate(buildTraceRoute(detail?.logs?.find((item) => item.action?.startsWith('ai-agent:tool:')) || detail?.logs?.[0] || null)!.path)}>
                    {buildTraceRoute(detail?.logs?.find((item) => item.action?.startsWith('ai-agent:tool:')) || detail?.logs?.[0] || null)!.label}
                  </Button>
                : '未识别'}
            </Descriptions.Item>
          </Descriptions>

          {(detail?.logs || []).some((item) => item.status === 'FAILED') && (
            <Alert
              showIcon
              type="error"
              title="检测到异常执行"
              description={buildSuggestion((detail?.logs || []).find((item) => item.status === 'FAILED') || null)}
            />
          )}

          <Card size="small" title="执行时间线" loading={detailLoading}>
            <Timeline
              items={(detail?.logs || []).map((item) => ({
                color: item.status === 'FAILED' ? 'red' : item.status === 'SUCCESS' ? 'green' : 'blue',
                children: (
                  <div>
                    <Space wrap>
                      <Typography.Text strong>{item.action || '未知动作'}</Typography.Text>
                      <Tag color={statusColor(item.status)}>{item.status || 'UNKNOWN'}</Tag>
                      <span>{item.createdAt || '--'}</span>
                      {typeof item.durationMs === 'number' ? <span>{item.durationMs}ms</span> : null}
                    </Space>
                    {item.reason ? <div style={{ marginTop: 6, color: '#595959' }}>{item.reason}</div> : null}
                    {item.errorMessage ? <div style={{ marginTop: 6, color: '#cf1322' }}>{item.errorMessage}</div> : null}
                    {item.status === 'FAILED' ? <div style={{ marginTop: 6, color: '#d46b08' }}>补救建议：{buildSuggestion(item)}</div> : null}
                    {item.resultData ? (
                      <pre style={{ marginTop: 8, background: '#fafafa', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {item.resultData}
                      </pre>
                    ) : null}
                  </div>
                ),
              }))}
            />
          </Card>
        </Space>
      </Drawer>
    </Layout>
  );
};

export default AiAgentTraceCenter;
