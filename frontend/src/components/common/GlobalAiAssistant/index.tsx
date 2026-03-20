import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  ExportOutlined,
  DownloadOutlined,
  LoadingOutlined,
  AudioMutedOutlined,
  ClearOutlined,
  PaperClipOutlined,
  LikeOutlined,
  DislikeOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { RiskIndicator, SimulationResultData, HyperAdvisorResponse, ChatHistoryMessage } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import styles from './index.module.css';
import MiniChartWidget, { type ChartSpec } from './MiniChartWidget';

/** 生成简短唯一 sessionId */
function genSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── 聊天会话 localStorage 持久化（7天过期）──
const SESSION_LS_KEY = 'ai_chat_session_v1';
const SESSION_MAX_DAYS = 7;

function saveSession(sessionId: string): void {
  try { localStorage.setItem(SESSION_LS_KEY, JSON.stringify({ sessionId, createdAt: Date.now() })); } catch {}
}

function loadSession(): string {
  try {
    const raw = localStorage.getItem(SESSION_LS_KEY);
    if (raw) {
      const { sessionId, createdAt } = JSON.parse(raw) as { sessionId: string; createdAt: number };
      const ageDays = (Date.now() - createdAt) / 86400000;
      if (ageDays < SESSION_MAX_DAYS && sessionId) return sessionId;
    }
  } catch {}
  const newId = genSessionId();
  saveSession(newId);
  return newId;
}

/** 轻量 Markdown → HTML（仅处理 AI 常用的格式） */
function renderSimpleMarkdown(text: string): string {
  // 先保护代码块
  const codeBlocks: string[] = [];
  let s = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code.trim());
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  // 按行处理
  const lines = s.split('\n');
  const html: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw;
    // 标题
    if (/^###\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:8px 0 4px;font-size:14px">${RegExp.$1}</strong>`);
      continue;
    }
    if (/^##\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:10px 0 4px;font-size:15px">${RegExp.$1}</strong>`);
      continue;
    }
    if (/^#\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:12px 0 6px;font-size:16px">${RegExp.$1}</strong>`);
      continue;
    }
    // 无序列表
    if (/^[-*]\s+(.+)/.test(line)) {
      if (!inList) { html.push('<ul style="margin:4px 0;padding-left:20px">'); inList = true; }
      html.push(`<li>${inlineFmt(RegExp.$1)}</li>`);
      continue;
    }
    // 有序列表
    if (/^\d+\.\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<div style="margin:2px 0">${inlineFmt(line)}</div>`);
      continue;
    }
    if (inList) { html.push('</ul>'); inList = false; }
    // 空行
    if (!line.trim()) { html.push('<br/>'); continue; }
    // 普通段落
    html.push(`<div style="margin:2px 0">${inlineFmt(line)}</div>`);
  }
  if (inList) html.push('</ul>');
  let result = html.join('');
  // 还原代码块
  result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) =>
    `<pre style="background:#f5f5f5;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin:6px 0"><code>${escHtml(codeBlocks[Number(i)])}</code></pre>`
  );
  return result;
}
function inlineFmt(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
}
function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** 白名单 HTML 标签清理（defense-in-depth，防止 XSS） */
const ALLOWED_TAGS = /^<\/?(strong|em|code|pre|ul|li|ol|div|br|span|p|a|h[1-6]|table|thead|tbody|tr|td|th)(\s[^>]*)?\/?>$/i;
function sanitizeHtml(html: string): string {
  return html.replace(/<\/?[^>]+(>|$)/g, (tag) => {
    if (ALLOWED_TAGS.test(tag)) return tag;
    return tag.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}



interface ActionCard {
  title: string;
  desc?: string;
  orderId?: string;
  // 催单专用字段
  orderNo?: string;
  responsiblePerson?: string;
  factoryName?: string;
  currentExpectedShipDate?: string;
  actions: Array<{
    label: string;
    type: 'mark_urgent' | 'remove_urgent' | 'navigate' | 'send_notification' | 'urge_order';
    path?: string;
  }>;
}

interface QuickAction {
  label: string;
  command: string;
  args?: Record<string, unknown>;
  style?: 'primary' | 'danger' | 'default';
}

/** 从 AI 原始回复中提取 CHART/ACTIONS 标记块，返回干净展示文本 + 结构化数据 */
function parseAiResponse(rawText: string): { displayText: string; charts: ChartSpec[]; actionCards: ActionCard[]; quickActions: QuickAction[] } {
  const charts: ChartSpec[] = [];
  const actionCards: ActionCard[] = [];
  const quickActions: QuickAction[] = [];
  const chartRe = /【CHART】([\s\S]*?)【\/CHART】/g;
  let m: RegExpExecArray | null;
  while ((m = chartRe.exec(rawText)) !== null) {
    try { charts.push(JSON.parse(m[1].trim())); } catch { /* skip */ }
  }
  const actionsRe = /【ACTIONS】([\s\S]*?)【\/ACTIONS】/g;
  while ((m = actionsRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as unknown;
      if (Array.isArray(parsed)) actionCards.push(...(parsed as ActionCard[]));
    } catch { /* skip */ }
  }
  // 解析 ```ACTIONS_JSON\n[...]\n``` 代码块 → 快捷操作按钮
  const actionsJsonRe = /```ACTIONS_JSON\s*\n([\s\S]*?)\n```/g;
  while ((m = actionsJsonRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as unknown;
      if (Array.isArray(parsed)) quickActions.push(...(parsed as QuickAction[]));
    } catch { /* skip */ }
  }
  const displayText = rawText
    .replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '')
    .replace(/【CHART】[\s\S]*?【\/CHART】/g, '')
    .replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '')
    .trim();
  return { displayText, charts, actionCards, quickActions };
}

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  intent?: string;
  hasSpeech?: boolean;
  reportType?: 'daily' | 'weekly' | 'monthly';
  charts?: ChartSpec[];
  actionCards?: ActionCard[];
  quickActions?: QuickAction[];
  /* ── hyper-advisor 扩展字段 ── */
  riskIndicators?: RiskIndicator[];
  simulation?: SimulationResultData;
  needsClarification?: boolean;
  traceId?: string;
  advisorSessionId?: string;
  userQuery?: string;             // 保存原始用户问题，用于反馈
}

const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: '你好呀～我是小云 🌤️ 有什么我可以帮你的吗？',
};

const SUGGESTIONS = [
  '📄 今日运营日报',
  '📅 本周工作总结',
  '📊 本月经营报告',
  '🚨 逾期订单预警',
  '⚠️ 异常订单排查',
];

const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

type CloudMood = 'normal' | 'curious' | 'urgent' | 'error' | 'success';

// 超级可爱的表情云朵组件
const CuteCloudTrigger = ({ size = 52, active = false, mood = 'normal', loading = false, interacting = false }: { size?: number, active?: boolean, mood?: CloudMood, loading?: boolean, interacting?: boolean }) => {
  const isUrgent = mood === 'urgent';
  const isError = mood === 'error';
  const isSuccess = mood === 'success';
  const isCurious = mood === 'curious';

  let bodyAnim = styles.cloudBodyNormal;
  if (isUrgent) bodyAnim = styles.cloudBodyUrgent;
  if (isError) bodyAnim = styles.cloudBodyError;
  if (isSuccess) bodyAnim = styles.cloudBodySuccess;
  if (active || interacting) bodyAnim = styles.cloudBodyInteract;

  const stop1 = isUrgent ? "#fff0f0" : isError ? "#f2f5f8" : "#ffffff";
  const stop2 = isUrgent ? "#ffccc7" : isError ? "#d9e2ec" : "#dcf0ff";

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 6px 12px rgba(24,144,255,0.4))' }}>
      <defs>
        <linearGradient id={`cloudGrad-${mood}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stop1} style={{ transition: 'stop-color 0.3s' }} />
          <stop offset="100%" stopColor={stop2} style={{ transition: 'stop-color 0.3s' }} />
        </linearGradient>

        <clipPath id="leftEyeClip">
           <rect x="36" y="38" width="20" height="24" className={styles.eyelidLeft} />
        </clipPath>
        <clipPath id="rightEyeClip">
           <rect x="60" y="38" width="20" height="24" className={styles.eyelidRight} />
        </clipPath>
      </defs>

      <g transform={active ? "translate(0, 0)" : "translate(0, 5)"}>
        <g className={bodyAnim}>
           {/* 软萌云朵基础层 */}
           <path d="M 30 65 A 15 15 0 0 1 30 35 A 18 18 0 0 1 60 25 A 22 22 0 0 1 85 50 A 15 15 0 0 1 85 75 L 30 75 A 15 15 0 0 1 30 65 Z" fill={`url(#cloudGrad-${mood})`} style={{ transition: 'fill 0.3s' }} />

           {isUrgent && (
             <path d="M 78 35 Q 78 40 76 42 Q 74 40 74 35 Q 74 30 76 28 Q 78 30 78 35 Z" fill="#69c0ff" opacity="0.8" className={styles.sweatAnim} />
           )}
           {isSuccess && (
             <g className={styles.starsAnim}>
                <path d="M 20 30 L 22 35 L 27 35 L 23 38 L 25 43 L 20 40 L 15 43 L 17 38 L 13 35 L 18 35 Z" fill="#ffdd00" />
                <path d="M 85 25 L 86 28 L 89 28 L 87 30 L 88 33 L 85 31 L 82 33 L 83 30 L 81 28 L 84 28 Z" fill="#ff7a45" />
             </g>
           )}

           {isUrgent && (
             <g stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round">
               <path d="M 40 45 L 48 48" />
               <path d="M 68 48 L 76 45" />
             </g>
           )}
           {isCurious && (
             <g stroke="#4B6685" strokeWidth="2" strokeLinecap="round">
               <path d="M 42 46 L 48 45" />
               <path d="M 68 45 L 74 46" />
             </g>
           )}

           {loading ? (
              <g stroke="#1890ff" strokeWidth="2.5" fill="none" strokeLinecap="round">
                <path d="M 46 50 A 4 4 0 1 1 45.9 50" className={styles.spinLeft} />
                <path d="M 70 50 A 4 4 0 1 1 69.9 50" className={styles.spinRight} />
              </g>
           ) : isError ? (
              <g>
                <path d="M 42 50 Q 46 45 50 50" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 66 50 Q 70 45 74 50" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
                <ellipse cx="46" cy="56" rx="2" ry="3" fill="#69c0ff" className={styles.tearTear} />
                <ellipse cx="70" cy="56" rx="2" ry="3" fill="#69c0ff" className={styles.tearTear} style={{ animationDelay: '0.5s' }} />
              </g>
           ) : isSuccess ? (
              <g fill="#ffbb96">
                 <path d="M 46 46 L 48 49 L 51 49 L 49 51 L 50 54 L 46 52 L 42 54 L 43 51 L 41 49 L 44 49 Z" />
                 <path d="M 70 46 L 72 49 L 75 49 L 73 51 L 74 54 L 70 52 L 66 54 L 67 51 L 65 49 L 68 49 Z" />
              </g>
           ) : (
              <g className={(interacting || active) ? styles.eyeFollowMouse : ''}>
                <g clipPath="url(#leftEyeClip)">
                  <circle cx={isCurious ? "48" : "46"} cy="50" r={isUrgent ? "5" : "6"} fill="#4B6685" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "47" : "44"} cy="48" r={isUrgent ? "1.5" : "2"} fill="#ffffff" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "49" : "47"} cy="52" r="1" fill="#ffffff" opacity="0.8" />
                </g>
                <g clipPath="url(#rightEyeClip)">
                  <circle cx={isCurious ? "68" : "70"} cy="50" r={isUrgent ? "5" : "6"} fill="#4B6685" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "67" : "68"} cy="48" r={isUrgent ? "1.5" : "2"} fill="#ffffff" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "69" : "71"} cy="52" r="1" fill="#ffffff" opacity="0.8" />
                </g>
              </g>
           )}

           {(!isError && !loading) && (
              <g opacity={isCurious ? "0.4" : "0.9"}>
                <ellipse cx="38" cy="58" rx="6" ry="3.5" fill={isUrgent ? "#ff4d4f" : "#FFA5BB"} className={styles.blushAnim} style={{ transition: 'fill 0.3s' }} />
                <ellipse cx="78" cy="58" rx="6" ry="3.5" fill={isUrgent ? "#ff4d4f" : "#FFA5BB"} className={styles.blushAnim} style={{ transition: 'fill 0.3s' }} />
              </g>
           )}

           <g>
             {loading ? (
               <line x1="56" y1="56" x2="60" y2="56" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
             ) : isUrgent ? (
               <ellipse cx="58" cy="57" rx="2.5" ry="3.5" fill="none" stroke="#4B6685" strokeWidth="2" />
             ) : isError ? (
               <path d="M 55 58 Q 58 55 61 58" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
             ) : isSuccess ? (
               <path d="M 54 54 Q 58 62 62 54" fill="#FF8CA3" stroke="#FF8CA3" strokeWidth="1" strokeLinecap="round" />
             ) : (
               <path d="M 54 55 Q 58 60 62 55" fill="none" stroke="#FF8CA3" strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'all 0.3s' }} />
             )}
           </g>
        </g>
      </g>
    </svg>
  );
};


// ── 任务流操作卡片组件 ─────────────────────────────────────────────────────────
/** 催单内联编辑卡片 — 跟单员/老板直接在 AI 对话中填写出货日期和备注 */
const UrgeOrderCard: React.FC<{ card: ActionCard; onSaved: () => void }> = ({ card, onSaved }) => {
  const [shipDate, setShipDate] = React.useState(card.currentExpectedShipDate ?? '');
  const [remarks, setRemarks] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async () => {
    if (!card.orderNo) return;
    setSaving(true);
    setError('');
    try {
      await intelligenceApi.quickEditOrder({
        orderNo: card.orderNo,
        expectedShipDate: shipDate || undefined,
        remarks: remarks || undefined,
        urgencyLevel: 'urgent',
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className={styles.urgeCardSaved}>
        ✅ 已更新订单 <strong>{card.orderNo}</strong> 的出货日期与备注，感谢配合！
      </div>
    );
  }

  return (
    <div className={styles.urgeOrderCard}>
      <div className={styles.urgeCardHeader}>
        📦 催单通知 — <strong>{card.orderNo}</strong>
        {card.factoryName && <span className={styles.urgeCardFactory}> · {card.factoryName}</span>}
      </div>
      {card.responsiblePerson && (
        <div className={styles.urgeCardPerson}>负责人：{card.responsiblePerson}</div>
      )}
      <div className={styles.urgeCardDesc}>{card.desc ?? '请填写最新预计出货日期和备注，以便跟进。'}</div>
      <div className={styles.urgeCardForm}>
        <label className={styles.urgeFormLabel}>预计出货日期</label>
        <input
          type="date"
          className={styles.urgeFormInput}
          value={shipDate}
          onChange={e => setShipDate(e.target.value)}
        />
        <label className={styles.urgeFormLabel}>备注说明</label>
        <textarea
          className={styles.urgeFormTextarea}
          placeholder="例如：面料延误 / 预计下周一交货..."
          value={remarks}
          rows={2}
          onChange={e => setRemarks(e.target.value)}
        />
        {error && <div className={styles.urgeCardError}>{error}</div>}
        <button
          className={styles.urgeSubmitBtn}
          onClick={() => { void handleSubmit(); }}
          disabled={saving || (!shipDate && !remarks)}
        >
          {saving ? '保存中…' : '✅ 确认提交'}
        </button>
      </div>
    </div>
  );
};

const ActionCardWidget: React.FC<{
  card: ActionCard;
  onAction: (type: string, path?: string, orderId?: string) => void;
  onUrgeOrderSaved?: () => void;
}> = ({ card, onAction, onUrgeOrderSaved }) => {
  // 催单卡片走专用组件
  if (card.actions.some(a => a.type === 'urge_order')) {
    return <UrgeOrderCard card={card} onSaved={onUrgeOrderSaved ?? (() => { /* no-op */ })} />;
  }
  return (
  <div className={styles.actionCard}>
    <div className={styles.actionCardTitle}>⚡ {card.title}</div>
    {card.desc && <div className={styles.actionCardDesc}>{card.desc}</div>}
    <div className={styles.actionCardBtns}>
      {card.actions.map((action, i) => (
        <button
          key={i}
          className={`${styles.actionBtn} ${action.type === 'mark_urgent' ? styles.actionBtnDanger : styles.actionBtnPrimary}`}
          onClick={() => onAction(action.type, action.path, card.orderId)}
        >
          {action.label}
        </button>
      ))}
    </div>
  </div>
  );
};

/* ── hyper-advisor 内嵌子组件 ─────────────────────────────────── */

/** 风险量化指标卡 */
const RiskIndicatorWidget: React.FC<{ items: RiskIndicator[] }> = ({ items }) => {
  if (!items?.length) return null;
  return (
    <div className={styles.riskIndicatorsWrapper}>
      {items.map((r, i) => {
        const lvl = (r.level || 'low').toLowerCase();
        const cls = lvl === 'high' ? styles.riskHigh : lvl === 'medium' ? styles.riskMedium : styles.riskLow;
        return (
          <div key={i} className={`${styles.riskCard} ${cls}`}>
            <span className={`${styles.riskProb} ${cls}`}>{Math.round(r.probability * 100)}%</span>
            <div className={styles.riskInfo}>
              <span className={styles.riskName}>{r.name}</span>
              {r.description && <span className={styles.riskDesc}>{r.description}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 数字孪生模拟结果 */
const SimulationWidget: React.FC<{ data: SimulationResultData }> = ({ data }) => {
  if (!data?.scenarioDescription) return null;
  const rows = data.scenarioRows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className={styles.simulationWrapper}>
      <div className={styles.simulationTitle}>📐 模拟：{data.scenarioDescription}</div>
      {rows.length > 0 && (
        <table className={styles.simulationTable}>
          <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}>{cols.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      )}
      {data.recommendation && <div className={styles.simulationRec}>💡 {data.recommendation}</div>}
    </div>
  );
};

/** 澄清追问卡片 */
const ClarificationCard: React.FC = () => (
  <div className={styles.clarificationCard}>
    <span className={styles.clarificationLabel}>🤔 我需要更多信息才能给出准确分析，请补充上方问题～</span>
  </div>
);

/** 反馈评分组件 */
const FeedbackWidget: React.FC<{
  msg: Message;
  onFeedback: (msg: Message, score: number) => void;
}> = ({ msg, onFeedback }) => {
  const [sent, setSent] = useState(false);
  if (!msg.traceId || sent) return null;
  const handleClick = (score: number) => { setSent(true); onFeedback(msg, score); };
  return (
    <div className={styles.feedbackRow}>
      <span className={styles.feedbackLabel}>这个回答有帮助吗？</span>
      <button className={styles.feedbackBtn} onClick={() => handleClick(5)} title="有用"><LikeOutlined /></button>
      <button className={styles.feedbackBtn} onClick={() => handleClick(1)} title="不太好"><DislikeOutlined /></button>
    </div>
  );
};

// ── 预警条目每日关闭 localStorage 方案 ──────────────────────────────────────────
const _aiPendingDismissKey = () => `ai_dismissed_pending_${new Date().toISOString().slice(0, 10)}`;
const loadDismissedPending = (): Set<string> => {
  try {
    const raw = localStorage.getItem(_aiPendingDismissKey());
    if (!raw) return new Set<string>();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? new Set<string>(arr as string[]) : new Set<string>();
  } catch { return new Set<string>(); }
};
const saveDismissedPending = (set: Set<string>) => {
  try { localStorage.setItem(_aiPendingDismissKey(), JSON.stringify([...set])); } catch {}
};

const GlobalAiAssistant: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [_mood, setMood] = useState<CloudMood>('normal');
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasFetchedMood, setHasFetchedMood] = useState(false);
  const [pendingItems, setPendingItems] = useState<Array<{orderNo: string; styleNo: string; factoryName: string; progress: number; daysLeft: number}>>([]);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // ── hyper-advisor 会话（localStorage 持久化，7天过期）──
  const [advisorSessionId, setAdvisorSessionId] = useState(loadSession);

  // 每日关闭记忆
  const [dismissedPending, setDismissedPending] = useState<Set<string>>(loadDismissedPending);
  const dismissPendingItem = (orderNo: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedPending(prev => {
      const next = new Set(prev); next.add(orderNo); saveDismissedPending(next); return next;
    });
  };
  const visiblePendingItems = pendingItems.filter(item => !dismissedPending.has(item.orderNo));

  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const factoryId = (user as any)?.factoryId;
        const res = await api.get('/dashboard/daily-brief', factoryId ? { params: { factoryId } } : undefined);
        // @ts-ignore
        const actualData = res?.code === 200 ? res.data : (res?.data || res);
        if (actualData) {
          const { overdueOrderCount = 0, highRiskOrderCount = 0, todayScanCount = 0, pendingItems: apiPendingItems = [], topPriorityOrder } = actualData;
          let newMood: CloudMood = 'normal';
          let greeting = INITIAL_MSG.text;
          const seed = overdueOrderCount * 17 + highRiskOrderCount * 11 + todayScanCount;

          // 存储待办详情供 UI 展示
          if (apiPendingItems && apiPendingItems.length > 0) {
            setPendingItems(apiPendingItems);
          } else if (topPriorityOrder) {
            setPendingItems([topPriorityOrder]);
          }

          if (overdueOrderCount >= 5 || highRiskOrderCount >= 3) {
            newMood = 'urgent';
            const topHint = topPriorityOrder ? `最紧急：${topPriorityOrder.orderNo}（${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%）` : '';
            greeting = choose(seed, [
              `现在有 ${overdueOrderCount + highRiskOrderCount} 个高优先级风险。${topHint}\n我可以先按影响面帮你排处理顺序。`,
              `当前高优先级风险共 ${overdueOrderCount + highRiskOrderCount} 个。${topHint}\n建议先收口最急的几单，我可以直接给出处理次序。`,
              `风险已经堆到 ${overdueOrderCount + highRiskOrderCount} 项。${topHint}\n你可以让我先把“先做什么”排出来。`,
            ]);
          } else if (overdueOrderCount > 0 || highRiskOrderCount > 0) {
            newMood = 'curious';
            const topHint = topPriorityOrder ? `\n📌 ${topPriorityOrder.orderNo}（${topPriorityOrder.styleNo || ''}）${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '还剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%` : '';
            greeting = choose(seed + 3, [
              `当前有 ${overdueOrderCount + highRiskOrderCount} 个待关注事项。${topHint}\n我可以继续往下拆：为什么慢、先动哪里。`,
              `现在有 ${overdueOrderCount + highRiskOrderCount} 项需要盯。${topHint}\n你可以让我直接给出优先处理顺序。`,
              `这会儿要关注的事项有 ${overdueOrderCount + highRiskOrderCount} 个。${topHint}\n我可以帮你把根因和动作排清楚。`,
            ]);
          } else if (todayScanCount > 100) {
            newMood = 'success';
            greeting = choose(seed + 5, [
              '今天节奏挺稳的呢 ✨ 继续帮你盯效率、风险和成本波动好不好～',
              '今天运行状态不错哦！要不要让我再做一轮隐患巡检看看？',
              '今天盘面挺好的～ 下一步可以看看效率和成本有没有小伏击！',
            ]);
          } else {
            newMood = 'normal';
            greeting = choose(seed + 7, [
              '你好呀！我是小云 🌤️ 有什么可以帮你的吗？随时问风险、订单进度都行哦！',
              '嘉～ 我是小云！想问风险、瓶颈还是交付进度？直接说就好啊！',
              '你好呀！我是小云 ☁️ 可以让我帮你看风险、瓶颈和交付影响～',
            ]);
            // 时间彩蛋
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 6) {
               greeting = '夜猫子！🌙 还在工作呀～ 让我帮你把夜间异常和明早要做的事整理一下吧！';
            } else if (hour >= 12 && hour <= 14) {
               greeting = '午休时间搶个手～ 🍱 要不要先快速过一遍上半天的数据？';
            } else if (hour >= 19) {
               greeting = '辛苦啊！🌸 到收尾阶段了，让我帮你整理今晚要盯的订单和明天计划～';
            }
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch (err) {
        console.error('Failed to fetch system mood', err);
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: '实时数据暂时没取到，但不要紧～随时问我都行哦！' }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood]);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // ── 历史记录恢复（mount时从后端加载，刷新后继续对话）──
  const historyFetchedRef = useRef(false);
  useEffect(() => {
    if (historyFetchedRef.current) return;
    historyFetchedRef.current = true;
    intelligenceApi.hyperAdvisorHistory(advisorSessionId)
      .then((list: ChatHistoryMessage[]) => {
        if (!Array.isArray(list) || list.length === 0) return;
        const restored = list.map((m, i) => ({
          id: `hist-${i}-${m.id}`,
          role: (m.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
          text: m.content ?? '',
        }));
        setMessages(prev => prev.length <= 1 ? [INITIAL_MSG, ...restored] : prev);
      })
      .catch(() => { /* 静默降级，不影响正常使用 */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听回车和滚到底部
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen]);

  // 打开时自动聚焦并语音播报欢迎语（如果支持）
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
      // 初次打开时不强制播报，留给用户交互，防止扰民
    }
  }, [isOpen]);

  const handleDownloadReport = async (type: 'daily' | 'weekly' | 'monthly') => {
    if (downloadingType) return;
    const label = type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报';
    setDownloadingType(type);
    try {
      await intelligenceApi.downloadProfessionalReport(type);
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: 'ai',
        text: `✅ ${label}已下载完成！Excel 格式的专业运营报告已保存到您的下载目录。`,
      }]);
      speak(`${label}已下载完成`);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'ai',
        text: `❌ ${label}下载失败，请稍后重试。`,
      }]);
    } finally {
      setDownloadingType(null);
    }
  };

  const streamAbortRef = useRef<AbortController | null>(null);

  /** hyper-advisor 反馈 */
  const handleAdvisorFeedback = useCallback((msg: Message, score: number) => {
    if (!msg.traceId) return;
    intelligenceApi.hyperAdvisorFeedback({
      sessionId: msg.advisorSessionId || advisorSessionId,
      traceId: msg.traceId,
      query: msg.userQuery || '',
      advice: msg.text,
      score,
      feedbackText: score >= 4 ? '有帮助' : '待改进',
    }).catch(() => { /* 静默 */ });
  }, [advisorSessionId]);

  const handleSend = async (manualText?: string) => {
    const text = (manualText || inputValue).trim();
    if (!text || isTyping) return;

    // 工厂账号：注入工厂上下文，让 AI 只返回本工厂数据
    const factoryId = (user as any)?.factoryId;
    const factoryName = (user as any)?.factoryName;
    const contextualText = factoryId
      ? `[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${text}`
      : text;

    // 1. 添加用户消息
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text
    };
    setMessages(prev => [...prev, userMsg]);
    if (!manualText) setInputValue('');
    setIsTyping(true);

    // 检查如果涉及到生成报表，加上带下载按钮的标识
    let reportTypeToDownload: 'daily' | 'weekly' | 'monthly' | undefined = undefined;
    if (text.includes('日报')) reportTypeToDownload = 'daily';
    if (text.includes('周报')) reportTypeToDownload = 'weekly';
    if (text.includes('月报')) reportTypeToDownload = 'monthly';

    const aiMsgId = `a-${Date.now()}`;

    // 2. 尝试流式接口，失败则 fallback 到同步接口
    try {
      let streamStarted = false;
      let accumulatedText = '';
      let toolStatus = '';

      const ctrl = intelligenceApi.aiAdvisorChatStream(
        contextualText,
        (event) => {
          streamStarted = true;
          if (event.type === 'thinking') {
            toolStatus = `🧠 思考中（第${event.data.iteration || 1}轮）...`;
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) {
                return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              }
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'tool_call') {
            toolStatus = `🔍 正在调用 ${event.data.tool || '工具'}...`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'tool_result') {
            const ok = event.data.success ? '✅' : '❌';
            toolStatus = `${ok} ${event.data.tool || '工具'}调用完成`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'answer') {
            const rawContent = String(event.data.content || '');
            const { displayText, charts, actionCards, quickActions } = parseAiResponse(rawContent);
            accumulatedText = displayText;
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText, reportType: reportTypeToDownload, charts, actionCards, quickActions }
              : m));
          } else if (event.type === 'error') {
            accumulatedText = String(event.data.message || '智能分析暂时异常，请稍后再试。');
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m));
          }
        },
        () => {
          // done — SSE 流结束后，异步调用 hyper-advisor 做风险/模拟/澄清增强
          setIsTyping(false);
          if (accumulatedText) speak(accumulatedText);
          // 异步增强：不阻塞主答复显示
          intelligenceApi.hyperAdvisorAsk(advisorSessionId, contextualText).then(resp => {
            const ha: HyperAdvisorResponse | undefined = (resp as any)?.code === 200
              ? (resp as any).data : ((resp as any)?.data || resp) as HyperAdvisorResponse;
            if (!ha) return;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              riskIndicators: ha.riskIndicators,
              simulation: ha.simulation,
              needsClarification: ha.needsClarification,
              traceId: ha.traceId,
              advisorSessionId: ha.sessionId,
              userQuery: text,
            } : m));
          }).catch(() => { /* 增强失败静默降级 */ });
        },
        async (err) => {
          // SSE 失败，fallback 到同步接口
          console.warn('SSE stream failed, falling back to sync:', err);
          if (streamStarted) {
            // 流已经开始了部分数据，直接报错
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText || '网络中断，请重试 🌧️' }
              : m));
            setIsTyping(false);
            return;
          }
          try {
            // @ts-ignore
            const res = await intelligenceApi.aiAdvisorChat(contextualText);
            // @ts-ignore
            const resultData: any = res?.code === 200 ? res.data : (res?.data || res);
            const answer = resultData?.answer || '当前还没拿到有效分析结果，请换个问法或稍后重试。';
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) {
                return prev.map(m => m.id === aiMsgId ? { ...m, text: answer, intent: resultData?.source, reportType: reportTypeToDownload } : m);
              }
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: answer, intent: resultData?.source, reportType: reportTypeToDownload }];
            });
            speak(answer);
          } catch (syncErr) {
            console.error('Sync fallback also failed:', syncErr);
            setMessages(prev => [...prev, { id: aiMsgId, role: 'ai' as const, text: '当前连不到数据服务，请稍后再试。' }]);
          } finally {
            setIsTyping(false);
          }
        },
      );
      streamAbortRef.current = ctrl;
    } catch (error) {
      console.error('AI Query Error:', error);
      setMessages(prev => [...prev, {
        id: aiMsgId,
        role: 'ai',
        text: '当前连不到数据服务，请稍后再试。'
      }]);
      setIsTyping(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.gif'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) { alert('只支持 Excel（xlsx/xls）、CSV 和图片文件'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('文件大小不能超过 5MB'); return; }
    setAttachedFile(file);
    e.target.value = '';
  };

  /** Stage10 — 语音录入：WebSpeechAPI 识别 → POST /intelligence/voice/command → 显示回答并朗读 */
  const handleVoiceInput = () => {
    // @ts-ignore – SpeechRecognition 在部分 TS 版本下需要忽略
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition
             // @ts-ignore
             || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { void handleSend('语音功能暂不支持该浏览器，请改用 Chrome。'); return; }
    if (isRecording) return;
    // @ts-ignore
    const recognition = new SR() as { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; onresult: ((e: Event) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; };
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsRecording(true);
    recognition.start();
    recognition.onresult = async (e: Event) => {
      // @ts-ignore
      const text = (e as { results: { [key: number]: { [key: number]: { transcript: string } } } }).results[0][0].transcript.trim();
      setIsRecording(false);
      if (!text) return;
      setInputValue(text);
      try {
        // @ts-ignore
        const res = await api.post('/intelligence/voice/command', { transcribedText: text, mode: 'QUERY' });
        // @ts-ignore
        const data = (res as Record<string, unknown>)?.data ?? res;
        const answer: string = ((data as Record<string, unknown>)?.responseText ?? (data as Record<string, unknown>)?.speakableText ?? '') as string;
        if (answer) {
          setMessages(prev => [
            ...prev,
            { id: `voice-u-${Date.now()}`, role: 'user' as const, text },
            { id: `voice-a-${Date.now()}`, role: 'ai' as const, text: answer },
          ]);
          setInputValue('');
          speak(answer);
        } else {
          void handleSend(text);
        }
      } catch {
        void handleSend(text);
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
  };

  const handleSendWithAttachment = async () => {
    if (!attachedFile) { void handleSend(); return; }
    const question = inputValue.trim();
    setUploadingFile(true);
    const userMsgText = question ? `📎 ${attachedFile.name}\n${question}` : `📎 ${attachedFile.name}`;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user' as const, text: userMsgText }]);
    setInputValue('');
    const fileToUpload = attachedFile;
    setAttachedFile(null);
    try {
      const result = await intelligenceApi.uploadAnalyze(fileToUpload);
      setUploadingFile(false);
      await handleSend(`${question || '请帮我分析这个文件'}\n\n${result.parsedContent}`);
    } catch {
      setUploadingFile(false);
      await handleSend(question || '文件上传失败，请直接描述需求');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (attachedFile) { void handleSendWithAttachment(); } else { void handleSend(); }
    }
  };

  // 语音播报 — 两层调制：业务场景识别 × 分段变调
  // 第一层：识别文本的业务情绪（逾期紧张/好消息欢快/数据报告沉稳/日常呆萌）定基调
  // 第二层：每个片段按标点（！蹦跶 / ？上扬 / 首句引入 / 末句收尾）在基调上叠加微调
  const speak = (text: string) => {
    if (isMuted) return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
    if (!cleanText.trim()) return;

    // eslint-disable-next-line no-undef
    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      const ttsText = cleanText.slice(0, 120);
      if (!ttsText.trim()) return;

      const voice = voices.find(v => v.lang.startsWith('zh') && (
        v.name.toLowerCase().includes('xiaoyi') ||
        v.name.toLowerCase().includes('xiaoxiao') ||
        v.name.includes('女') ||
        v.name.toLowerCase().includes('female')
      )) ?? voices.find(v => v.lang.includes('zh'));

      // ① 第一层：业务情绪识别，根据关键词判断说话场景
      type Mood = 'urgent' | 'good' | 'report' | 'casual';
      const mood: Mood = (() => {
        // 逾期/延期/紧急/货期风险 → 焦急紧张调（音调偏低、语速偏快，像在汇报紧急事件）
        if (/逾期|延期|超期|紧急|风险|危|警告|超时|未完成|拖期|差\d+天|快来不及|来不及/.test(ttsText)) return 'urgent';
        // 完成/达成/入库/好消息 → 欢快庆祝调（音调高亢活泼）
        if (/完成|入库|达成|顺利|好消息|超额|已完成|搞定|漂亮|太棒/.test(ttsText)) return 'good';
        // 数据/统计/日报 → 沉稳播报调（音调中档、节奏稳，但还是萌萌的）
        if (/今日|共计|统计|合计|分析|扫码|共\d|总计|汇总|件数|订单数/.test(ttsText)) return 'report';
        return 'casual';
      })();

      // ② 情绪基准值
      //   urgent: pitch偏低+rate快 = 急促说话感
      //   good:   pitch超高+rate稍快 = 兴奋欢呼感
      //   report: pitch中档+rate稳 = 沉着播报感
      //   casual: 标准呆萌基调
      const base = ({
        urgent: { pitch: 1.50, rate: 1.00 },
        good:   { pitch: 1.90, rate: 0.88 },
        report: { pitch: 1.62, rate: 0.84 },
        casual: { pitch: 1.72, rate: 0.83 },
      } as Record<Mood, { pitch: number; rate: number }>)[mood];

      // ③ 按标点拆段，短于2字的合并
      const rawSegments = ttsText.split(/(?<=[。！？…～~]+)/);
      const segments: string[] = [];
      let buf = '';
      for (const s of rawSegments) {
        buf += s;
        if (buf.replace(/\s/g, '').length >= 2) { segments.push(buf); buf = ''; }
      }
      if (buf.trim()) segments.push(buf);

      // ④ 第二层逐段叠加：在基调上按标点微调
      const speakSegment = (i: number) => {
        if (i >= segments.length) return;
        const seg = segments[i].trim();
        if (!seg) { speakSegment(i + 1); return; }

        const u = new SpeechSynthesisUtterance(seg);
        u.lang = 'zh-CN';
        if (voice) u.voice = voice;
        u.volume = 0.92;

        let p = base.pitch;
        let r = base.rate;

        if (/[！!]/.test(seg))              { p += 0.20; r += 0.07; }  // 蹦跶高音
        else if (/[？?]/.test(seg))         { p += 0.10; r -= 0.08; }  // 上扬疑惑
        else if (i === 0)                   { p += 0.12; }              // 开场引入
        else if (i === segments.length - 1) { p -= 0.07; r -= 0.05; }  // 收尾余韵

        u.pitch = Math.max(0.5, Math.min(2.0, p));
        u.rate  = Math.max(0.5, Math.min(1.5, r));
        u.onend = () => speakSegment(i + 1);
        window.speechSynthesis.speak(u);
      };

      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      speakSegment(0);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        doSpeak(window.speechSynthesis.getVoices());
      }, { once: true });
    }
  };

  const jumpToIntelligenceCenter = (_query: string) => {
    setIsOpen(false);
    // 如果已经在智能驾驶舱，不跨路由跳转仅提示
    if (location.pathname !== '/intelligence/center') {
      navigate('/intelligence/center');
    }
  };

  return (
    <div className={styles.assistantWrapper}>
      {/* 弹出的对话面板 */}
      {isOpen && (
        <div className={styles.chatPanel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.avatarContainer}>
              <CuteCloudTrigger size={40} active />
            </div>
            <div className={styles.headerText}>
              <div className={styles.headerTitle}>小云 智能助理</div>
              <div className={styles.headerSubtitle}>云裳智链 · 实时判断与执行协作</div>
            </div>
            <div className={styles.headerActions}>
              {isMuted ? (
                <AudioMutedOutlined
                  className={styles.headerActionBtn}
                  onClick={() => setIsMuted(false)}
                  title="取消静音"
                />
              ) : (
                <SoundOutlined
                  className={styles.headerActionBtn}
                  onClick={() => setIsMuted(true)}
                  title="静音"
                />
              )}
              <ClearOutlined
                className={styles.headerActionBtn}
                onClick={() => {
                  const newId = genSessionId();
                  saveSession(newId);
                  setAdvisorSessionId(newId);
                  setMessages([INITIAL_MSG]);
                  setPendingItems([]);
                  setInputValue('');
                  setHasFetchedMood(false);
                  historyFetchedRef.current = true; // 防止重新加载旧历史
                }}
                title="清空对话"
              />
              <CloseOutlined
                className={`${styles.headerActionBtn} ${styles.closeBtnIcon}`}
                onClick={() => setIsOpen(false)}
                title="关闭"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className={styles.chatArea} ref={chatAreaRef}>
            {/* 预警待办 - 每日可关闭，下一天重新显示 */}
            {messages.length === 1 && visiblePendingItems.length > 0 && (
              <div className={styles.pendingItems}>
                {visiblePendingItems.map((item: any) => {
                  const dl = item.daysLeft;
                  const status = dl < 0 ? `已逾期${Math.abs(dl)}天` : dl === 0 ? '今天到期' : `剩${dl}天`;
                  return (
                    <div key={item.orderNo} className={styles.pendingItem} style={{position:'relative'}}
                      onClick={() => { setIsOpen(false); navigate(`/production?orderNo=${encodeURIComponent(item.orderNo)}`); }}
                    >
                      <span>⚠️</span>
                      <span style={{flex:1}}>{item.orderNo}{item.styleNo ? `（${item.styleNo}）` : ''} — {status}，进度{item.progress}%</span>
                      <span style={{color:'#1890ff',fontSize:11}}>查看 →</span>
                      <button
                        className={styles.pendingDismissBtn}
                        onClick={(e) => dismissPendingItem(item.orderNo, e)}
                        title="今日不再提醒"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length === 1 && (
              <div className={styles.suggestionChips}>
                {SUGGESTIONS.map(q => (
                  <div key={q} className={styles.chip} onClick={() => handleSend(q)}>
                    {q}
                  </div>
                ))}
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`${styles.messageRow} ${msg.role === 'ai' ? styles.rowAi : styles.rowUser}`}
              >
                {msg.role === 'ai' && (
                  <div className={styles.messageAvatar}>
                    <CuteCloudTrigger size={24} active />
                  </div>
                )}

                <div className={`${styles.messageBubble} ${msg.role === 'ai' ? styles.bubbleAi : styles.bubbleUser}`}>
                  {msg.role === 'ai' ? (
                    <div
                      className={styles.mdContent}
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(renderSimpleMarkdown(
                          msg.text.includes('【推荐追问】：')
                            ? msg.text.split('【推荐追问】：')[0]
                            : msg.text
                        ))
                      }}
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  )}
                  {msg.text.includes('【推荐追问】：') && (
                    <div className={styles.recommendWrapper}>
                      <div className={styles.recommendTitle}>你可以接着问：</div>
                      <div className={styles.recommendPills}>
                        {msg.text.split('【推荐追问】：')[1].split('|').map((q, idx) => {
                          const question = q.trim();
                          if (!question) return null;
                          return (
                            <div
                              key={idx}
                              className={styles.recommendPill}
                              onClick={() => handleSend(question)}
                            >
                              {question}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 如果命中高级业务Intent，提示去全屏的太空舱查看完整看板 */}
                  {msg.role === 'ai' && msg.intent && (
                    <div
                      className={styles.intentWidgetHint}
                      onClick={() => jumpToIntelligenceCenter(msg.text)}
                    >
                      <ExportOutlined /> 在智能驾驶舱展开查看完整图表
                    </div>
                  )}

                  {/* 针对生成的报表，展示下载按钮 */}
                  {msg.role === 'ai' && msg.reportType && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        className={styles.reportDownloadBtn}
                        disabled={!!downloadingType}
                        onClick={() => handleDownloadReport(msg.reportType!)}
                        style={{ width: '100%', marginBottom: 0 }}
                      >
                        {downloadingType === msg.reportType ? <LoadingOutlined /> : <DownloadOutlined />}
                        <span>下载{msg.reportType === 'daily' ? '运营日报' : msg.reportType === 'weekly' ? '运营周报' : '运营月报'}</span>
                      </button>
                    </div>
                  )}
                  {/* 内嵌迷你图表 */}
                  {msg.role === 'ai' && !!msg.charts?.length && (
                    <div className={styles.chartsWrapper}>
                      {msg.charts.map((chart, i) => <MiniChartWidget key={i} chart={chart} />)}
                    </div>
                  )}
                  {/* 任务流操作卡片 */}
                  {msg.role === 'ai' && !!msg.actionCards?.length && (
                    <div className={styles.actionCardsWrapper}>
                      {msg.actionCards.map((card, i) => (
                        <ActionCardWidget
                          key={i}
                          card={card}
                          onUrgeOrderSaved={() => void handleSend(`订单 ${card.orderNo ?? card.orderId} 出货信息已更新`)}
                          onAction={(type, path, orderId) => {
                            if (type === 'navigate' && path) {
                              // 路径白名单校验，防止 AI 生成不存在的路由导致页面不存在错误
                              const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic'];
                              const safePath = knownPrefixes.some(p => path.startsWith(p)) ? path : '/production';
                              setIsOpen(false);
                              navigate(safePath);
                            }
                            else if (type === 'mark_urgent' && orderId) { void handleSend(`把订单 ${orderId} 标记为紧急`); }
                            else { void handleSend(`执行操作：${card.title}`); }
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {/* ACTIONS_JSON 快捷操作按钮 */}
                  {msg.role === 'ai' && !!msg.quickActions?.length && (
                    <div className={styles.quickActionsRow}>
                      {msg.quickActions.map((action, i) => (
                        <button
                          key={i}
                          className={`${styles.actionBtn} ${action.style === 'danger' ? styles.actionBtnDanger : styles.actionBtnPrimary}`}
                          onClick={() => handleSend(action.label)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* ── hyper-advisor 增强区域 ── */}
                  {msg.role === 'ai' && msg.needsClarification && <ClarificationCard />}
                  {msg.role === 'ai' && !!msg.riskIndicators?.length && <RiskIndicatorWidget items={msg.riskIndicators} />}
                  {msg.role === 'ai' && msg.simulation && <SimulationWidget data={msg.simulation} />}
                  {msg.role === 'ai' && msg.traceId && <FeedbackWidget msg={msg} onFeedback={handleAdvisorFeedback} />}
                </div>

                {/* 语音播报小按钮(仅AI部分) */}
                {msg.role === 'ai' && (
                  <button className={styles.speechBtn} onClick={() => speak(msg.text)} title="朗读回答">
                    <SoundOutlined />
                  </button>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isTyping && (
              <div className={`${styles.messageRow} ${styles.rowAi}`}>
                <div className={styles.messageAvatar}>
                  <CuteCloudTrigger size={24} active />
                </div>
                <div className={`${styles.messageBubble} ${styles.bubbleAi}`}>
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingDot} />
                    <div className={styles.typingDot} />
                    <div className={styles.typingDot} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif"
              onChange={handleFileSelect}
            />
            {attachedFile && (
              <div className={styles.attachChip}>
                <span>📎 {attachedFile.name}</span>
                <button className={styles.attachChipRemove} onClick={() => setAttachedFile(null)}>×</button>
              </div>
            )}
            <div className={styles.inputRow}>
              <button
                className={styles.uploadBtn}
                title="上传文件（Excel/CSV/图片）"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping || uploadingFile}
              >
                <PaperClipOutlined />
              </button>
              <input
                ref={inputRef}
                type="text"
                className={styles.chatInput}
                placeholder="输入问题，或上传 Excel / CSV 文件分析"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping || uploadingFile}
              />
              <button
                className={styles.voiceBtn}
                title="语音输入（点击后说话）"
                onClick={handleVoiceInput}
                disabled={isTyping || isRecording}
                style={{ color: isRecording ? '#f5222d' : undefined }}
              >
                {isRecording ? <LoadingOutlined spin /> : '🎤'}
              </button>
              <button
                className={styles.sendBtn}
                onClick={() => attachedFile ? void handleSendWithAttachment() : void handleSend()}
                disabled={(!inputValue.trim() && !attachedFile) || isTyping || uploadingFile}
              >
                {uploadingFile ? <LoadingOutlined /> : <SendOutlined />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮图标开关 */}
      {!isOpen && (
        <div
          className={styles.triggerBtn}
          onClick={() => setIsOpen(true)}
          title="召唤小云智能助手"
        >
          <CuteCloudTrigger size={56} />
          {visiblePendingItems.length > 0 && (
            <span className={styles.triggerBadge}>{visiblePendingItems.length}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalAiAssistant;
