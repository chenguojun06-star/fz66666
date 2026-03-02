import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Button, Spin, Tag, Alert, Collapse, Progress, Table } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, BookOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { NlQueryResponse, LearningReportResponse, StageLearningStat } from '@/services/production/productionApi';

const stageColumns = [
  { title: '工序', dataIndex: 'stageName', key: 'stageName', width: 100 },
  {
    title: '样本数', dataIndex: 'sampleCount', key: 'sampleCount', width: 90,
    sorter: (a: StageLearningStat, b: StageLearningStat) => a.sampleCount - b.sampleCount,
  },
  {
    title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 120,
    render: (v: number) => <Progress percent={Math.round(v * 100)} size="small" status={v >= 0.7 ? 'success' : v >= 0.4 ? 'normal' : 'exception'} />,
    sorter: (a: StageLearningStat, b: StageLearningStat) => a.confidence - b.confidence,
  },
  {
    title: '均值(分/件)', dataIndex: 'avgMinutesPerUnit', key: 'avgMinutesPerUnit', width: 110,
    render: (v: number) => v?.toFixed(2),
  },
];

/** 数据 key → 中文标签 */
const DATA_LABELS: Record<string, string> = {
  // 基础查询
  overdueCount: '延期订单',
  todayScanQty: '今日扫码件数',
  todayScans: '今日扫码次数',
  yesterdayScans: '昨日扫码次数',
  todayWarehouse: '今日入库',
  yesterdayWarehouse: '昨日入库',
  totalWarehousing: '累计入库',
  todayCutting: '今日裁剪件数',
  inProgress: '在制订单',
  overdue: '延期订单',
  activeWorkers: '活跃工人',
  totalOrders: '在制订单数',
  totalQty: '在制总件数',
  qualifiedRate: '合格率',
  qualified: '合格件数',
  unqualified: '不合格件数',
  progress: '进度',
  completed: '已完成件数',
  total: '总件数',
  orderNo: '订单号',
  status: '状态',
  factory: '工厂',
  // 健康指数
  healthIndex: '健康指数',
  grade: '评级',
  productionScore: '生产评分',
  deliveryScore: '交期评分',
  qualityScore: '质量评分',
  inventoryScore: '库存评分',
  financeScore: '财务评分',
  topRisk: '首要风险',
  // 瓶颈检测
  hasBottleneck: '存在瓶颈',
  bottleneckCount: '瓶颈数量',
  topBottleneck: '首要瓶颈',
  // 风险 & 异常
  dangerCount: '高危数量',
  warningCount: '预警数量',
  totalChecked: '检查总数',
  anomalyCount: '异常数量',
  topAnomaly: '首要异常',
  // 工厂 & 员工
  totalFactories: '参评工厂',
  totalEvaluated: '评估总人数',
  topFactory: '排名最高工厂',
  topWorkerName: '最高效率员工',
  scanRatePerHour: '每小时扫码量',
  activeFactories: '活跃工厂',
  // 利润 & 成本
  quotationTotal: '报价总额',
  totalCost: '总成本',
  estimatedProfit: '预估利润',
  grossMarginPct: '毛利率 %',
  profitStatus: '利润状态',
  // 缺陷 & 节拍
  totalDefects: '缺陷总数',
  worstProcess: '最差工序',
  worstFactory: '最差工厂',
  avgPace: '平均节拍',
  // 排程 & 通知
  planCount: '排程方案数',
  pendingCount: '待处理通知',
  sentToday: '今日已发送',
  // 自检 & 学习
  healthScore: '系统健康分',
  issuesFound: '发现问题',
  autoFixed: '自动修复',
  totalSamples: '样本总量',
  stageCount: '工序数',
  avgConfidence: '平均置信度',
};

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  confidence?: number;
  suggestions?: string[];
  data?: Record<string, unknown>;
  source?: 'local' | 'ai' | 'none';
}

const WELCOME = '👋 你好！我是AI决策助手，模式：实时业务数据 + DeepSeek智能分析。\n\n试试问我：\n• 「整体情况怎么样？」\n• 「有哪些订单即将达交期？」\n• 「面料缺口风险怎么处理？」\n• 「今日扫码多少次？」\n• 「如何提高交期达成率？」';

const NlQueryPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      content: WELCOME,
      suggestions: ['整体情况怎么样？', '系统健康指数？', '有瓶颈吗？', '你能做什么？'],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  /* AI 学习状态 */
  const [learnData, setLearnData] = useState<LearningReportResponse | null>(null);
  useEffect(() => {
    intelligenceApi.getLearningReport().then((res: any) => setLearnData(res?.data ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const doSend = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || sendingRef.current) return;
    sendingRef.current = true;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    setError('');
    try {
      // 统一走 ai-advisor/chat 接口：后端自动本地规则引擎 → DeepSeek（注入全系统上下文）
      const res = await intelligenceApi.aiAdvisorChat(q) as any;
      const d = res?.data ?? null;
      if (d?.answer) {
        setMessages(prev => [...prev, {
          role: 'ai',
          content: d.answer,
          source: d.source,
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: '抱歉，未能理解你的提问。' }]);
      }
    } catch (e: any) {
      setError(e?.message || '查询失败');
      setMessages(prev => [...prev, { role: 'ai', content: '出错了，请稍后再试。' }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }, []);

  const send = useCallback(() => doSend(input), [input, doSend]);

  const handleSuggestion = (s: string) => doSend(s);

  const formatDataValue = (key: string, value: unknown): string => {
    if (key === 'qualifiedRate') return `${value}%`;
    if (key === 'progress') return `${value}%`;
    // skip complex objects
    if (typeof value === 'object') return '';
    return String(value);
  };

  return (
    <div className="intelligence-panel nl-panel">
      {/* AI 学习状态（可折叠） */}
      {learnData && (
        <Collapse
          size="small"
          style={{ marginBottom: 12 }}
          items={[{
            key: 'learn',
            label: (
              <span>
                <BookOutlined style={{ marginRight: 6 }} />
                AI 学习状态 — 样本 {learnData.totalSamples} · 工序 {learnData.stageCount} · 置信度 {Math.round(learnData.avgConfidence * 100)}%
              </span>
            ),
            children: (
              <div>
                <div className="stat-row">
                  <div className="stat-card"><div className="stat-value" style={{ color: '#1677ff' }}>{learnData.totalSamples}</div><div className="stat-label">训练样本</div></div>
                  <div className="stat-card"><div className="stat-value">{learnData.stageCount}</div><div className="stat-label">覆盖工序</div></div>
                  <div className="stat-card"><Progress type="circle" percent={Math.round(learnData.avgConfidence * 100)} size={56} strokeColor={learnData.avgConfidence >= 0.7 ? '#52c41a' : '#faad14'} /><div className="stat-label">置信度</div></div>
                  <div className="stat-card"><div className="stat-value" style={{ color: '#52c41a' }}>{learnData.feedbackCount}</div><div className="stat-label">反馈次数</div></div>
                </div>
                {learnData.lastLearnTime && <div style={{ fontSize: 12, color: '#8c8c8c', margin: '8px 0' }}>最后学习：{learnData.lastLearnTime}</div>}
                <Table rowKey="stageName" columns={stageColumns} dataSource={learnData.stages || []} pagination={false} size="small" />
              </div>
            ),
          }]}
        />
      )}
      <div className="chat-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble ${msg.role}`}>
            <div className="chat-avatar">
              {msg.role === 'ai' ? <RobotOutlined /> : <UserOutlined />}
            </div>
            <div className="chat-body">
              <div className="chat-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              {(msg.confidence !== undefined || msg.source) && (
                <div className="chat-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {msg.confidence !== undefined && (
                    <Tag color={msg.confidence >= 80 ? 'green' : msg.confidence >= 50 ? 'orange' : 'red'}>
                      置信度 {msg.confidence}%
                    </Tag>
                  )}
                  {msg.source === 'ai' && (
                    <Tag color="purple" style={{ fontSize: 11 }}>🤖 DeepSeek分析</Tag>
                  )}
                  {msg.source === 'local' && (
                    <Tag color="geekblue" style={{ fontSize: 11 }}>⚡ 本地规则</Tag>
                  )}
                </div>
              )}
              {msg.data && Object.keys(msg.data).length > 0 && (
                <div className="chat-data" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {Object.entries(msg.data)
                    .filter(([, v]) => typeof v !== 'object')
                    .map(([k, v]) => {
                      const label = DATA_LABELS[k] || k;
                      const val = formatDataValue(k, v);
                      return val ? <Tag key={k} color="blue">{label}：{val}</Tag> : null;
                    })}
                </div>
              )}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="chat-suggestions" style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {msg.suggestions.map((s, si) => (
                    <Button key={si} size="small" type="dashed" onClick={() => handleSuggestion(s)}>{s}</Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble ai">
            <div className="chat-avatar"><RobotOutlined /></div>
            <div className="chat-body"><Spin size="small" /> <span style={{ marginLeft: 8 }}>思考中...</span></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} closable />}
      <div className="chat-input-row">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="试试问「整体情况怎么样？」「和昨天比呢？」「谁产量最高？」"
          onPressEnter={send}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={send} loading={loading}>发送</Button>
      </div>
    </div>
  );
};

export default NlQueryPanel;
