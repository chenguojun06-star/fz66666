import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
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
  PaperClipOutlined
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import styles from './index.module.css';

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

// ── 富媒体结构类型 ─────────────────────────────────────────────────────────

interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'progress';
  title: string;
  xAxis?: string[];
  series?: Array<{ name: string; data?: number[]; value?: number }>;
  value?: number;
  colors?: string[];
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

/** 从 AI 原始回复中提取 CHART/ACTIONS 标记块，返回干净展示文本 + 结构化数据 */
function parseAiResponse(rawText: string): { displayText: string; charts: ChartSpec[]; actionCards: ActionCard[] } {
  const charts: ChartSpec[] = [];
  const actionCards: ActionCard[] = [];
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
  const displayText = rawText
    .replace(/【CHART】[\s\S]*?【\/CHART】/g, '')
    .replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '')
    .trim();
  return { displayText, charts, actionCards };
}

// ── 模块级 ECharts 懒加载（必须在组件外定义，不能在 render 函数中调用 lazy）
const ReactEChartsLazy = lazy(() => import('echarts-for-react'));

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  intent?: string;
  hasSpeech?: boolean;
  reportType?: 'daily' | 'weekly' | 'monthly';
  charts?: ChartSpec[];
  actionCards?: ActionCard[];
}

const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: '👋 你好，我是小云 — 你的智能运营助理。\n\n我能帮你做什么：\n📊 **日报 / 周报 / 月报** — 一句话拉取经营数据汇总\n🚨 **异常检测** — 自动发现成本、进度、质量偏差\n⏰ **逾期预警** — 快速定位逾期订单并给出建议\n\n直接点下方快捷入口，或输入任何问题开始对话 👇',
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

// ── 迷你图表组件 ─────────────────────────────────────────────────────────────
const MiniChartWidget: React.FC<{ chart: ChartSpec }> = ({ chart }) => {
  if (chart.type === 'progress') {
    return (
      <div className={styles.miniProgressChart}>
        <div className={styles.miniChartTitle}>{chart.title}</div>
        <div className={styles.progressBarWrap}>
          <div className={styles.progressBarFill} style={{ width: `${Math.min(chart.value ?? 0, 100)}%` }} />
        </div>
        <div className={styles.progressLabel}>{chart.value ?? 0}%</div>
      </div>
    );
  }
  let option: Record<string, unknown>;
  if (chart.type === 'pie') {
    option = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{ type: 'pie', radius: ['40%', '70%'], data: chart.series, label: { show: false } }],
    };
  } else {
    option = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: chart.xAxis, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      grid: { top: 30, right: 10, bottom: 30, left: 40 },
      color: chart.colors ?? ['#1890ff', '#52c41a', '#fa8c16'],
      series: chart.series?.map(s => ({ name: s.name, type: chart.type === 'line' ? 'line' : 'bar', data: s.data })),
    };
  }
  return (
    <div className={styles.miniEChart}>
      <div className={styles.miniChartTitle}>{chart.title}</div>
      <Suspense fallback={<div className={styles.chartLoading}>图表加载中…</div>}>
        <ReactEChartsLazy option={option} style={{ height: '140px' }} opts={{ renderer: 'svg' }} />
      </Suspense>
    </div>
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

const GlobalAiAssistant: React.FC = () => {
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

  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const res = await api.get('/dashboard/daily-brief');
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
              '今天整体节奏比较稳，我可以继续帮你盯效率、风险和成本波动。',
              '当前运行状态不错，你可以让我再做一轮隐患巡检。',
              '今天盘面偏稳，接下来可以重点看效率和成本有没有暗点。',
            ]);
          } else {
            newMood = 'normal';
            greeting = choose(seed + 7, [
              '您好，我是小云。你可以直接问我今天先盯哪几单、为什么、先做什么。',
              '您好，我是小云。你可以让我先把今天的重点风险和处理顺序排出来。',
              '您好，我是小云。你可以直接让我看风险、瓶颈和交付影响。',
            ]);
            // 时间彩蛋
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 6) {
               greeting = '当前仍有业务在跑，我可以先把夜间异常和明早优先事项排出来。';
            } else if (hour >= 12 && hour <= 14) {
               greeting = '现在适合快速过一遍半天经营情况，我可以先总结风险和下午动作。';
            } else if (hour >= 19) {
               greeting = '现在适合收口今天的问题，我可以整理今晚要盯的订单和明天动作。';
            }
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch (err) {
        console.error('Failed to fetch system mood', err);
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: '实时数据暂时没取到，但您仍可以继续提问，我会尽量基于现有上下文协助判断。' }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood]);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleSend = async (manualText?: string) => {
    const text = (manualText || inputValue).trim();
    if (!text || isTyping) return;

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
        text,
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
            const { displayText, charts, actionCards } = parseAiResponse(rawContent);
            accumulatedText = displayText;
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText, reportType: reportTypeToDownload, charts, actionCards }
              : m));
          } else if (event.type === 'error') {
            accumulatedText = String(event.data.message || '智能分析暂时异常，请稍后再试。');
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m));
          }
        },
        () => {
          // done
          setIsTyping(false);
          if (accumulatedText) speak(accumulatedText);
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
            const res = await intelligenceApi.aiAdvisorChat(text);
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

  // 语音播报方法（固定使用 xiaoxiao 呆萌中文女声）
  const speak = (text: string) => {
    if (isMuted) return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
    if (!cleanText.trim()) return;

    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-CN';
      // 固定用 xiaoxiao 呆萌女声，找不到则兜底任意中文声音
      const voice = voices.find(v => v.lang.includes('zh') && v.name.toLowerCase().includes('xiaoxiao'))
        ?? voices.find(v => v.lang.includes('zh'));
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      utterance.pitch = 1.25;
      utterance.volume = 0.9;
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
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
                  setMessages([INITIAL_MSG]);
                  setPendingItems([]);
                  setInputValue('');
                  setHasFetchedMood(false);
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
            {/* Suggestion Chips - 像原来的智能顾问一样 */}
            {messages.length === 1 && pendingItems.length > 0 && (
              <div className={styles.pendingItems}>
                {pendingItems.map((item: any) => {
                  const dl = item.daysLeft;
                  const status = dl < 0 ? `已逾期${Math.abs(dl)}天` : dl === 0 ? '今天到期' : `剩${dl}天`;
                  return (
                    <div key={item.orderNo} className={styles.pendingItem}
                      onClick={() => handleSend(`帮我分析订单 ${item.orderNo} 的详细情况和风险`)}
                    >
                      <span>⚠️</span>
                      <span style={{flex:1}}>{item.orderNo}{item.styleNo ? `（${item.styleNo}）` : ''} — {status}，进度{item.progress}%</span>
                      <span style={{color:'#1890ff',fontSize:11}}>查看 →</span>
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
                            if (type === 'navigate' && path) { setIsOpen(false); navigate(path); }
                            else if (type === 'mark_urgent' && orderId) { void handleSend(`把订单 ${orderId} 标记为紧急`); }
                            else { void handleSend(`执行操作：${card.title}`); }
                          }}
                        />
                      ))}
                    </div>
                  )}
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
        </div>
      )}
    </div>
  );
};

export default GlobalAiAssistant;
