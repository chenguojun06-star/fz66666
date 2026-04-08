import React, { useEffect } from 'react';
import { Button, Select, Input, Tag, Progress, Spin, Alert, Divider, Rate, Segmented, Tooltip } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { ThunderboltOutlined, BranchesOutlined, HistoryOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useAgentGraphStore, type NodeEvent } from '@/stores/useAgentGraphStore';

const SCENES = [
  { value: 'full',          label: ' 全面分析' },
  { value: 'delivery_risk', label: ' 货期风险' },
  { value: 'sourcing',      label: ' 采购风险' },
  { value: 'compliance',    label: ' 合规 DPP' },
  { value: 'logistics',     label: ' 物流优化' },
];

const ROUTE_MAP: Record<string, [string, string]> = {
  delivery_risk: ['货期风险路由', '#ff4d4f'],
  sourcing:      ['采购路由',     '#1890ff'],
  compliance:    ['合规路由',     '#52c41a'],
  logistics:     ['物流路由',     '#13c2c2'],
  full:          ['全面路由',     '#722ed1'],
};

const NODE_LABELS: Record<string, [string, string]> = {
  digital_twin:  [' 数字孪生',  '#818cf8'],
  supervisor:    [' Supervisor', '#a78bfa'],
  specialists:   [' Specialist', '#60a5fa'],
  reflection:    [' Reflection', '#facc15'],
  re_route:      [' 重路由',     '#f97316'],
};

const confColor = (v: number) =>
  v >= 80 ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f';

const RouteTag: React.FC<{ route?: string }> = ({ route }) => {
  const [label, color] = ROUTE_MAP[route ?? ''] ?? [route ?? '—', '#999'];
  return <Tag color={color} style={{ fontWeight: 600 }}>{label}</Tag>;
};

/* ── 图节点流水线可视化 ──────────────────────────── */
const GraphPipeline: React.FC<{ events: NodeEvent[]; streaming: boolean }> = ({ events, streaming }) => {
  const allNodes = ['digital_twin', 'supervisor', 'specialists', 'reflection'];
  const completedNodes = new Set(events.map(e => e.node));
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      padding: '10px 0', overflowX: 'auto',
    }}>
      {allNodes.map((node, idx) => {
        const done = completedNodes.has(node);
        const active = streaming && !done && idx === completedNodes.size;
        const [label, color] = NODE_LABELS[node] ?? [node, '#999'];
        return (
          <React.Fragment key={node}>
            {idx > 0 && (
              <div style={{
                width: 32, height: 2,
                background: done ? color : 'rgba(255,255,255,0.1)',
                transition: 'background 0.3s',
              }} />
            )}
            <Tooltip title={done ? `完成: ${JSON.stringify(events.find(e => e.node === node)?.data ?? {}).slice(0, 120)}` : active ? '执行中...' : '等待'}>
              <div style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: `1.5px solid ${done ? color : active ? color : 'rgba(255,255,255,0.15)'}`,
                background: done ? `${color}22` : active ? `${color}11` : 'transparent',
                color: done ? color : active ? color : '#666',
                transition: 'all 0.3s',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}>
                {label}
                {active && <Spin size="small" style={{ marginLeft: 6 }} />}
                {done && <span style={{ marginLeft: 4 }}></span>}
              </div>
            </Tooltip>
          </React.Fragment>
        );
      })}
      {/* re_route 可选节点 */}
      {completedNodes.has('re_route') && (
        <>
          <div style={{ width: 32, height: 2, background: '#f97316' }} />
          <div style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1.5px solid #f97316', background: '#f9731622', color: '#f97316',
            whiteSpace: 'nowrap',
          }}> 重路由 </div>
        </>
      )}
    </div>
  );
};

/* ── Specialist 结果卡片 ──────────────────────────── */
const SpecialistCards: React.FC<{ results?: Record<string, string> }> = ({ results }) => {
  if (!results || Object.keys(results).length === 0) return null;
  const nameMap: Record<string, string> = {
    delivery: ' 货期分析', sourcing: ' 采购分析',
    compliance: ' 合规分析', logistics: ' 物流分析',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 8 }}>
      {Object.entries(results).map(([key, val]) => (
        <div key={key} style={{
          background: 'rgba(0,0,0,0.18)', borderRadius: 6, padding: '8px 10px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', marginBottom: 4 }}>
            {nameMap[key] ?? key}
          </div>
          <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {(val?.length ?? 0) > 300 ? val.slice(0, 300) + '…' : val}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── 历史表格 ──────────────────────────────────────── */
const HistoryTable: React.FC = () => {
  const { history, historyLoading, loadHistory, submitFeedback } = useAgentGraphStore();
  useEffect(() => { loadHistory(); }, []);
  const columns = [
    { title: '时间', dataIndex: 'createTime', width: 140, render: (v: string) => v?.replace('T', ' ').slice(0, 16) },
    { title: '场景', dataIndex: 'scene', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '路由', dataIndex: 'route', width: 100, render: (v: string) => <RouteTag route={v} /> },
    { title: '置信', dataIndex: 'confidenceScore', width: 60, render: (v: number) => <span style={{ color: confColor(v) }}>{v}</span> },
    { title: '耗时', dataIndex: 'latencyMs', width: 70, render: (v: number) => `${v}ms` },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => { const m: Record<string, string> = { SUCCESS: '成功', FAILED: '失败', EXECUTING: '执行中', TIMEOUT: '超时' }; return <Tag color={v === 'SUCCESS' ? 'green' : 'red'}>{m[v] || v || '未知'}</Tag>; } },
    {
      title: '评分', dataIndex: 'userFeedback', width: 130,
      render: (v: number, row: any) => (
        <Rate
          count={5} value={v ?? 0}
          style={{ fontSize: 13 }}
          onChange={(val) => submitFeedback(row.id, val).then(loadHistory).catch(console.error)}
        />
      ),
    },
  ];
  return (
    <ResizableTable
      dataSource={history}
      columns={columns}
      loading={historyLoading}
      rowKey="id"
      size="small"
      pagination={false}
      style={{ marginTop: 8 }}
    />
  );
};

/* ── 主面板 ─────────────────────────────────────────── */
const AgentGraphPanel: React.FC = () => {
  const {
    loading, result, error,
    scene, orderIds, question, streamStatus, nodeEvents,
    activeTab,
    setScene, setOrderIds, setQuestion, setActiveTab,
    runGraphStream, reset,
  } = useAgentGraphStore();

  const streaming = streamStatus === 'streaming' || streamStatus === 'connecting';

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Tab 切换 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Segmented
          size="small"
          value={activeTab}
          onChange={(v) => setActiveTab(v as 'run' | 'history')}
          options={[
            { value: 'run', label: <span><PlayCircleOutlined /> 执行</span> },
            { value: 'history', label: <span><HistoryOutlined /> 历史</span> },
          ]}
        />
      </div>

      {activeTab === 'history' && <HistoryTable />}

      {activeTab === 'run' && (
        <>
          {/* ── 参数输入区 ────────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr 1fr auto',
            gap: 8,
            marginBottom: 12,
          }}>
            <Select value={scene} onChange={setScene} options={SCENES} size="small" style={{ width: '100%' }} />
            <Input
              placeholder="订单ID（逗号分隔，留空=全部）"
              value={orderIds}
              onChange={e => setOrderIds(e.target.value)}
              size="small"
            />
            <Input
              placeholder="自然语言问题（可选）"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              size="small"
            />
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              loading={loading}
              onClick={runGraphStream}
              style={{ background: '#7c3aed', borderColor: '#7c3aed', whiteSpace: 'nowrap' }}
            >
              流式执行
            </Button>
          </div>

          {/* ── 图流水线可视化 ────────────────────────────── */}
          {(streaming || nodeEvents.length > 0) && (
            <GraphPipeline events={nodeEvents} streaming={streaming} />
          )}

          {/* ── 执行中 ────────────────────────────────────── */}
          {streaming && nodeEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#a78bfa' }}>
              <Spin size="small" />
              <span style={{ marginLeft: 8, fontSize: 12 }}>
                AI 多代理图推理中… DigitalTwin → Supervisor → Specialist → Reflect
              </span>
            </div>
          )}

          {/* ── 错误 ──────────────────────────────────────── */}
          {error && (
            <Alert
              type="error"
              title={error}
              style={{ marginBottom: 8 }}
              action={<Button size="small" onClick={reset}>清除</Button>}
            />
          )}

          {/* ── 结果展示 ──────────────────────────────────── */}
          {result && !loading && (
            <div style={{
              background: 'rgba(124,58,237,0.06)',
              border: '1px solid rgba(124,58,237,0.22)',
              borderRadius: 8,
              padding: 12,
            }}>
              {/* 路由 + 置信度 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <BranchesOutlined style={{ color: '#a78bfa' }} />
                <RouteTag route={result.route} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>置信度</div>
                  <Progress
                    percent={result.confidenceScore}
                    strokeColor={confColor(result.confidenceScore)}
                    size="small"
                    style={{ marginBottom: 0 }}
                    format={v => <span style={{ fontSize: 11, color: confColor(v!) }}>{v} 分</span>}
                  />
                </div>
                <span style={{ fontSize: 11, color: '#666' }}>{result.latencyMs} ms</span>
              </div>

              {/* 节点轨迹 */}
              {result.nodeTrace && result.nodeTrace.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#888', marginRight: 6 }}>执行路径:</span>
                  {result.nodeTrace.map((n, i) => (
                    <Tag key={i} style={{ fontSize: 10 }}>{n}</Tag>
                  ))}
                </div>
              )}

              <Divider style={{ margin: '6px 0', borderColor: 'rgba(124,58,237,0.2)' }} />

              {/* Specialist 结果 */}
              <SpecialistCards results={result.specialistResults} />

              {/* 分析摘要 */}
              {result.contextSummary && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, marginBottom: 4 }}>
                    <XiaoyunCloudAvatar size={16} active />分析结果
                  </div>
                  <div style={{ fontSize: 12, color: '#d4d4d4', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                    {result.contextSummary}
                  </div>
                </div>
              )}

              {/* 优化建议 */}
              {result.optimizationSuggestion && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#34d399', fontWeight: 600, marginBottom: 4 }}>
                     AI 优化建议
                  </div>
                  <div style={{ fontSize: 12, color: '#d4d4d4', lineHeight: 1.65 }}>
                    {result.optimizationSuggestion}
                  </div>
                </div>
              )}

              {/* 自我反思 */}
              {result.reflection && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#faad14', fontWeight: 600, marginBottom: 4 }}>
                     自我反思（置信评估）
                  </div>
                  <div style={{
                    fontSize: 11, color: '#8b8b8b', fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.22)',
                    padding: '6px 8px', borderRadius: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  }}>
                    {result.reflection.length > 400 ? result.reflection.substring(0, 400) + ' …' : result.reflection}
                  </div>
                </div>
              )}

              {/* 反馈评分 */}
              {result.executionId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>结果评分:</span>
                  <Rate
                    count={5}
                    style={{ fontSize: 14 }}
                    onChange={(val) => {
                      const store = useAgentGraphStore.getState();
                      store.submitFeedback(result.executionId!, val).catch(console.error);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AgentGraphPanel;
