import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag } from 'antd';
import { RobotOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { intelligenceApi } from '../../../../../services/intelligence/intelligenceApi';
import './AgentActivityPanel.css';

type AgentInfo = {
  id: string; name: string; department: string; color: string; description: string;
  status: string; lastActivity: string | null; tasksToday: number; successRate: number;
  avgDurationMs: number; intelligenceScore: number; lazinessScore: number;
  currentTask: string | null; position: { x: number; y: number };
};
type AlertInfo = { id: number; type: string; level: string; title: string; time: string | null };

const STATUS_LABEL: Record<string, string> = {
  working: '工作中', idle_recent: '刚空闲', idle: '空闲', sleeping: '休眠', unknown: '未知',
};

const DEPT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  production: { label: '生产管理部', color: '#4a6cf7', icon: '🏭' },
  finance: { label: '财务管理部', color: '#ec4899', icon: '💰' },
  warehouse: { label: '仓储管理部', color: '#f59e0b', icon: '📦' },
  basic: { label: '基础业务部', color: '#14b8a6', icon: '✂️' },
  intelligence: { label: '智能运营中心', color: '#8b5cf6', icon: '🧠' },
};

function scoreColor(score: number, type: 'int' | 'lazy'): string {
  if (type === 'int') return score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return score >= 60 ? '#ef4444' : score >= 30 ? '#f59e0b' : '#22c55e';
}

const Workstation: React.FC<{
  agent: AgentInfo;
  selected: boolean;
  onSelect: () => void;
  tick: number;
}> = ({ agent, selected, onSelect, tick }) => {
  const isWorking = agent.status === 'working';
  const isSleeping = agent.status === 'sleeping';
  const isIdleRecent = agent.status === 'idle_recent';

  const screenContent = useMemo(() => {
    if (!isWorking || !agent.currentTask) return null;
    const text = agent.currentTask;
    const visibleChars = Math.floor((tick % 60) / 2) % (text.length + 3);
    return text.slice(0, Math.min(visibleChars, text.length));
  }, [isWorking, agent.currentTask, tick]);

  return (
    <div
      className={`ws-station ${selected ? 'ws-station--selected' : ''} ${isWorking ? 'ws-station--working' : ''} ${isSleeping ? 'ws-station--sleeping' : ''}`}
      onClick={onSelect}
      style={{ '--agent-color': agent.color } as React.CSSProperties}
    >
      <div className="ws-desk">
        <div className="ws-desk-top">
          <div className="ws-monitor">
            <div className="ws-monitor-screen">
              {isWorking && screenContent && (
                <div className="ws-screen-text">{screenContent}<span className="ws-cursor">|</span></div>
              )}
              {isWorking && !screenContent && (
                <div className="ws-screen-loading">
                  <div className="ws-loading-bar" style={{ width: `${30 + Math.sin(tick * 0.1) * 20}%` }} />
                </div>
              )}
              {!isWorking && !isSleeping && (
                <div className="ws-screen-idle">
                  <span className="ws-screen-logo">☁️</span>
                </div>
              )}
              {isSleeping && (
                <div className="ws-screen-sleep">💤</div>
              )}
            </div>
            <div className="ws-monitor-stand" />
          </div>
          <div className="ws-keyboard" />
          {isWorking && (
            <div className="ws-coffee">
              <div className="ws-coffee-steam" style={{ animationDelay: `${tick * 0.1}s` }}>~</div>
            </div>
          )}
        </div>
        <div className="ws-desk-front" />
      </div>

      <div className="ws-chair">
        <div className={`ws-character ${isWorking ? 'ws-character--typing' : ''} ${isSleeping ? 'ws-character--sleeping' : ''}`}>
          <div className="ws-char-head" style={{ background: agent.color }}>
            <div className="ws-char-face">
              {isWorking && <span className="ws-char-eyes ws-char-eyes--focused">◉◉</span>}
              {isIdleRecent && <span className="ws-char-eyes">●●</span>}
              {!isWorking && !isIdleRecent && !isSleeping && <span className="ws-char-eyes ws-char-eyes--bored">◡◡</span>}
              {isSleeping && <span className="ws-char-eyes ws-char-eyes--closed">––</span>}
            </div>
          </div>
          <div className="ws-char-body" style={{ background: agent.color }}>
            {isWorking && <div className="ws-char-arms ws-char-arms--typing" />}
            {!isWorking && <div className="ws-char-arms" />}
          </div>
        </div>
      </div>

      <div className="ws-info">
        <div className="ws-name">{agent.name}</div>
        <div className="ws-status-row">
          <span className={`ws-status-dot ws-status-dot--${agent.status}`} />
          <span className="ws-status-text">{STATUS_LABEL[agent.status]}</span>
          {agent.tasksToday > 0 && <span className="ws-task-count">{agent.tasksToday}任务</span>}
        </div>
        {isWorking && agent.currentTask && (
          <div className="ws-current-task" style={{ borderColor: agent.color }}>
            ⚡ {agent.currentTask}
          </div>
        )}
      </div>

      {isWorking && (
        <div className="ws-glow" style={{ background: agent.color }} />
      )}
    </div>
  );
};

const DeptSection: React.FC<{
  deptKey: string;
  agents: AgentInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tick: number;
}> = ({ deptKey, agents, selectedId, onSelect, tick }) => {
  const cfg = DEPT_CONFIG[deptKey];
  if (!cfg) return null;
  const workingCount = agents.filter((a) => a.status === 'working').length;

  return (
    <div className="dept-section" style={{ '--dept-color': cfg.color } as React.CSSProperties}>
      <div className="dept-header">
        <span className="dept-icon">{cfg.icon}</span>
        <span className="dept-name">{cfg.label}</span>
        <span className="dept-count">{agents.length}人</span>
        {workingCount > 0 && (
          <span className="dept-working-badge">
            <span className="dept-working-pulse" />{workingCount}工作中
          </span>
        )}
      </div>
      <div className="dept-floor">
        <div className="dept-floor-grid" />
        <div className="dept-workstations">
          {agents.map((agent) => (
            <Workstation
              key={agent.id}
              agent={agent}
              selected={selectedId === agent.id}
              onSelect={() => onSelect(agent.id)}
              tick={tick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const AgentDetailCard: React.FC<{ agent: AgentInfo }> = ({ agent }) => {
  const a = agent;
  return (
    <div className="agent-detail" style={{ '--agent-color': a.color } as React.CSSProperties}>
      <div className="agent-detail-header">
        <div className="agent-detail-avatar" style={{ background: a.color }}>{a.name[0]}</div>
        <div>
          <div className="agent-detail-name">{a.name}</div>
          <div className="agent-detail-dept">{DEPT_CONFIG[a.department]?.icon} {DEPT_CONFIG[a.department]?.label}</div>
        </div>
        <span className={`agent-detail-status agent-detail-status--${a.status}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      <div className="agent-detail-desc">{a.description}</div>
      <div className="agent-detail-stats">
        <div className="agent-detail-stat">
          <span className="agent-detail-stat-label">今日任务</span>
          <span className="agent-detail-stat-value" style={{ color: '#4a6cf7' }}>{a.tasksToday}</span>
        </div>
        <div className="agent-detail-stat">
          <span className="agent-detail-stat-label">成功率</span>
          <span className="agent-detail-stat-value" style={{ color: a.successRate >= 80 ? '#22c55e' : '#f59e0b' }}>{a.successRate}%</span>
        </div>
        <div className="agent-detail-stat">
          <span className="agent-detail-stat-label">聪明度</span>
          <span className="agent-detail-stat-value" style={{ color: scoreColor(a.intelligenceScore, 'int') }}>{a.intelligenceScore}</span>
        </div>
        <div className="agent-detail-stat">
          <span className="agent-detail-stat-label">偷懒度</span>
          <span className="agent-detail-stat-value" style={{ color: scoreColor(a.lazinessScore, 'lazy') }}>{a.lazinessScore}</span>
        </div>
        <div className="agent-detail-stat">
          <span className="agent-detail-stat-label">平均耗时</span>
          <span className="agent-detail-stat-value">{a.avgDurationMs}ms</span>
        </div>
      </div>
      {a.currentTask && (
        <div className="agent-detail-task" style={{ borderLeftColor: a.color }}>
          ⚡ 当前任务：{a.currentTask}
        </div>
      )}
    </div>
  );
};

const DEFAULT_AGENTS: AgentInfo[] = [
  { id: 'order-manager', name: '订单管家', department: 'production', color: '#1677ff', description: '管理生产订单全生命周期：创建、编辑、转厂、催单、学习、对比', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'material-buyer', name: '物料采购员', department: 'production', color: '#52c41a', description: '面辅料采购：到货入库、领料、对账、采购单管理、供应商管理', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'quality-inspector', name: '质检巡检员', department: 'production', color: '#faad14', description: '成品质检入库、次品返修报废、工资异常检测', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'production-scheduler', name: '生产调度员', department: 'production', color: '#ff7a45', description: '生产进度查询、异常上报、裁剪单创建、拆菲转派', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'crew-coordinator', name: '生产协调员', department: 'production', color: '#00838f', description: '自然语言命令解析、批量生产建议、订单只读分析', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'finance-settler', name: '财务结算员', department: 'finance', color: '#eb2f96', description: '财务审批付款、工资结算审批、出货对账、发票管理、税务配置', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'warehouse-keeper', name: '仓库管理员', department: 'warehouse', color: '#722ed1', description: '库存管理：物料库存查询、成品库存、样衣借还、盘点、操作日志', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'inventory-manager', name: '出入库专员', department: 'warehouse', color: '#fa8c16', description: '出入库操作：面辅料收货入库、成品出库、采购到货、领料管理', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'style-designer', name: '样衣开发员', department: 'basic', color: '#13c2c2', description: '样衣开发与纸样管理：款式建档、模板、难度评估、报价、二次加工', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'data-analyst', name: '数据分析师', department: 'intelligence', color: '#fa541c', description: '深度分析、延期趋势、供应商评分、智能报表、管理看板、系统概览', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'risk-sentinel', name: '风险哨兵', department: 'intelligence', color: '#f5222d', description: '根因分析、人员延期分析、变更审批、生产异常上报', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'smart-advisor', name: '智能顾问', department: 'intelligence', color: '#2f54eb', description: 'AI对话：知识搜索、多代理协同、Agent例会、团队分派', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'learning-engine', name: '学习引擎', department: 'intelligence', color: '#52c41a', description: '自主学习：规律发现、目标拆解、Critic进化、场景模拟、自我优化', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'system-doctor', name: '系统医生', department: 'intelligence', color: '#9254de', description: '系统诊断与自愈：代码诊断、组织查询、用户管理、字典维护', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'patrol-sentinel', name: '巡逻哨兵', department: 'intelligence', color: '#e65100', description: '自动巡检：逾期扫描、停滞检测、主动诊断、智能备注推送', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'sourcing-specialist', name: '采购专家', department: 'intelligence', color: '#00897b', description: 'BOM成本分析、供应商交付评估、物料缺口识别', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'delivery-specialist', name: '交付专家', department: 'intelligence', color: '#d84315', description: '交付风险评估、订单健康评分、逾期预警', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'compliance-specialist', name: '合规专家', department: 'intelligence', color: '#6a1b9a', description: '质量合格率分析、缺陷追踪、DPP合规检查', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'logistics-specialist', name: '物流专家', department: 'intelligence', color: '#1565c0', description: '库存水位分析、出入库节奏、物流延迟风险', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'evolution-engine', name: '进化引擎', department: 'intelligence', color: '#ad1457', description: 'GitHub技术研究、反馈驱动进化、自我优化提案', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'insight-generator', name: '洞察生成器', department: 'intelligence', color: '#00695c', description: '每日洞察简报、晨报生成、业务趋势分析', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'smart-remark', name: '智能备注员', department: 'intelligence', color: '#5d4037', description: '自动备注：订单备注巡检、智能备注推送、异常标记', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'critic-agent', name: '批评检查官', department: 'intelligence', color: '#4e342e', description: '审查AI输出：数据溯源校验、逻辑一致性检查、遗漏检测', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'hyper-advisor', name: '超级顾问', department: 'intelligence', color: '#1a237e', description: '深度推演、风险模拟、知识收割、安全建议', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'forecast-engine', name: '预测引擎', department: 'intelligence', color: '#0d47a1', description: '交付预测：交期建议、销售预测、进度预测', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'visual-ai', name: '视觉AI', department: 'intelligence', color: '#311b92', description: '图像分析：图片识别、文件分析、视觉质检', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'voice-command', name: '语音指令', department: 'intelligence', color: '#4a148c', description: '语音交互：语音命令解析、语音转文字、语音操作', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'self-healing', name: '自愈引擎', department: 'intelligence', color: '#b71c1c', description: '数据修复：一致性诊断、自动修复、孤儿数据检测', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'intelligence-brain', name: '智能中枢', department: 'intelligence', color: '#1b5e20', description: '大脑快照：健康度聚合、风险脉搏、异常感知、学习闭环', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
  { id: 'anomaly-detector', name: '异常检测器', department: 'intelligence', color: '#880e4f', description: '异常检测：对账异常、工厂瓶颈、物料短缺、停滞预警', status: 'idle', lastActivity: null, tasksToday: 0, successRate: 100, avgDurationMs: 0, intelligenceScore: 50, lazinessScore: 0, currentTask: null, position: { x: 0, y: 0 } },
];

const AgentActivityPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>(DEFAULT_AGENTS);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [agentsResp, alertsResp] = await Promise.all([intelligenceApi.getAgentActivityList(), intelligenceApi.getAgentAlerts()]);
      const agentsData: any[] = (agentsResp as any)?.data || [];
      const alertsData = (alertsResp as any)?.data || [];
      setAgents(agentsData as AgentInfo[]);
      setIsLive(agentsData.length > 0);
      setAlerts(alertsData as AlertInfo[]);
    } catch (e) { console.warn('AgentActivity fetch error:', e); }
  }, []);

  useEffect(() => { void fetchData(); const t = setInterval(() => void fetchData(), 15000); return () => clearInterval(t); }, [fetchData]);

  const workingCount = useMemo(() => agents.filter((a) => a.status === 'working').length, [agents]);
  const criticalAlerts = useMemo(() => alerts.filter((a) => a.level === 'critical').length, [alerts]);
  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedId), [agents, selectedId]);
  const [clock, setClock] = useState(dayjs().format('HH:mm:ss'));
  useEffect(() => { const t = setInterval(() => setClock(dayjs().format('HH:mm:ss')), 1000); return () => clearInterval(t); }, []);

  const filteredDepts = deptFilter ? [deptFilter] : Object.keys(DEPT_CONFIG);

  return (
    <div className="office-root">
      <div className="office-toolbar">
        <div className="office-toolbar-left">
          <div className="office-toolbar-title">
            <span className="office-toolbar-logo">🏢</span>
            AI 智能体办公室
          </div>
          <Tag color="blue" style={{ margin: 0 }}><RobotOutlined /> {agents.length}人</Tag>
          <Tag color="green" style={{ margin: 0 }}><ThunderboltOutlined /> {workingCount}工作中</Tag>
          {criticalAlerts > 0 && <Tag color="red" style={{ margin: 0 }}><WarningOutlined /> {criticalAlerts}告警</Tag>}
        </div>
        <div className="office-toolbar-right">
          <span className={`office-live-dot ${isLive ? 'office-live-dot--on' : ''}`} />
          <span className="office-clock">{clock}</span>
        </div>
      </div>

      <div className="office-dept-tabs">
        <button className={`office-dept-tab ${!deptFilter ? 'office-dept-tab--active' : ''}`} onClick={() => setDeptFilter(null)}>全部</button>
        {Object.entries(DEPT_CONFIG).map(([key, cfg]) => (
          <button key={key} className={`office-dept-tab ${deptFilter === key ? 'office-dept-tab--active' : ''}`} onClick={() => setDeptFilter(deptFilter === key ? null : key)} style={{ '--tab-color': cfg.color } as React.CSSProperties}>
            {cfg.icon} {cfg.label}
          </button>
        ))}
      </div>

      <div className="office-floor-3d">
        <div className="office-floor-inner">
          {filteredDepts.map((deptKey) => {
            const deptAgents = agents.filter((a) => a.department === deptKey);
            if (deptAgents.length === 0) return null;
            return (
              <DeptSection
                key={deptKey}
                deptKey={deptKey}
                agents={deptAgents}
                selectedId={selectedId}
                onSelect={setSelectedId}
                tick={tick}
              />
            );
          })}
        </div>
      </div>

      {selectedAgent && (
        <AgentDetailCard agent={selectedAgent} />
      )}

      {alerts.length > 0 && (
        <div className="office-alerts">
          {alerts.slice(0, 3).map((a) => (
            <div key={a.id} className={`office-alert office-alert--${a.level}`}>
              <WarningOutlined /> {a.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentActivityPanel;
