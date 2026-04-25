import { parseXiaoyunLegacyMeta } from '@/services/intelligence/xiaoyunChatAdapter';
import type { RiskIndicator, SimulationResultData } from '@/services/intelligence/intelligenceApi';
import type { XiaoyunInsightCardData } from '@/components/common/XiaoyunInsightCard';
import type { ChartSpec } from './MiniChartWidget';
import type { AiTraceCardData, BundleSplitCardData, PurchaseDocCardData, TeamStatusCardData } from './AgentCards';
import type { StepWizardCardData } from './StepWizardCard';
import type { OverdueFactoryCardData } from './OverdueFactoryCardWidget';

export interface ActionCard {
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

export interface QuickAction {
  label: string;
  command: string;
  args?: Record<string, unknown>;
  style?: 'primary' | 'danger' | 'default';
}

/* ── 上下文跟进动作（FollowUp Suggestion） ── */
export interface ActionFieldOption {
  label: string;
  value: unknown;
}

export interface ActionField {
  key: string;
  label: string;
  inputType: 'text' | 'number' | 'date' | 'select';
  placeholder?: string;
  defaultValue?: unknown;
  options?: ActionFieldOption[];
}

export interface FollowUpAction {
  label: string;
  icon?: string;
  actionType: 'EXECUTE' | 'NAVIGATE' | 'ASK';
  command?: string;
  dataSummary?: string;
  prefilledParams?: Record<string, unknown>;
  requiredInputs?: ActionField[];
}

/** 从 AI 原始回复中提取 CHART/ACTIONS 标记块，返回干净展示文本 + 结构化数据 */
export function parseAiResponse(rawText: string): {
  displayText: string;
  charts: ChartSpec[];
  cards: XiaoyunInsightCardData[];
  actionCards: ActionCard[];
  quickActions: QuickAction[];
  teamStatusCards: TeamStatusCardData[];
  bundleSplitCards: BundleSplitCardData[];
  stepWizardCards: StepWizardCardData[];
  clarificationHints?: string[];
  overdueFactoryCard?: OverdueFactoryCardData;
  reportPreview?: ReportPreviewData;
  reportType?: 'daily' | 'weekly' | 'monthly';
} {
  const parsed = parseXiaoyunLegacyMeta(rawText);
  return {
    displayText: parsed.displayText,
    charts: parsed.charts as ChartSpec[],
    cards: parsed.cards,
    actionCards: parsed.actionCards as ActionCard[],
    quickActions: parsed.quickActions as QuickAction[],
    teamStatusCards: parsed.teamStatusCards as TeamStatusCardData[],
    bundleSplitCards: parsed.bundleSplitCards as BundleSplitCardData[],
    stepWizardCards: parsed.stepWizardCards as StepWizardCardData[],
    clarificationHints: parsed.clarificationHints,
    overdueFactoryCard: parsed.overdueFactoryCard,
    reportPreview: parsed.reportPreview,
    reportType: parsed.reportType,
  };
}

export interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  intent?: string;
  hasSpeech?: boolean;
  reportType?: 'daily' | 'weekly' | 'monthly';
  charts?: ChartSpec[];
  cards?: XiaoyunInsightCardData[];
  actionCards?: ActionCard[];
  quickActions?: QuickAction[];
  teamStatusCards?: TeamStatusCardData[];
  bundleSplitCards?: BundleSplitCardData[];
  stepWizardCards?: StepWizardCardData[];
  purchaseDocCard?: PurchaseDocCardData;
  agentCommandId?: string;
  agentTraceCard?: AiTraceCardData;
  /* ── hyper-advisor 扩展字段 ── */
  riskIndicators?: RiskIndicator[];
  simulation?: SimulationResultData;
  needsClarification?: boolean;
  clarificationHints?: string[];
  traceId?: string;
  advisorSessionId?: string;
  userQuery?: string;             // 保存原始用户问题，用于反馈
  /* ── Traceable Advice 卡片 ── */
  traceableAdvice?: {
    traceId: string;
    title: string;
    summary: string;
    reasoningChain: string[];
    proposedActions: Array<{
      label: string;
      actionCommand: string;
      actionParams?: Record<string, unknown>;
      riskWarning?: string;
    }>;
    confidenceScore?: number;
  };
  /* ── 上下文跟进动作 ── */
  followUpActions?: FollowUpAction[];
  /* ── 逾期工厂卡片 ── */
  overdueFactoryCard?: OverdueFactoryCardData;
  /* ── 专业运营报告预览（日/周/月） ── */
  reportPreview?: ReportPreviewData;
}

/** 专业运营报告 JSON 摘要（与 Excel 同源数据） */
export interface ReportPreviewData {
  reportType: 'daily' | 'weekly' | 'monthly';
  typeLabel: string;
  rangeLabel: string;
  baseDate: string;
  scope: string;
  kpis: Array<{
    name: string;
    current: number;
    previous: number | null;
    unit: string;
    change: string | null;
  }>;
  scanTypes: Array<{ name: string; count: number; percent: number }>;
  orderStatus: Array<{ name: string; count: number }>;
  factoryRanking: Array<{ rank: number; name: string; scanCount: number; scanQty: number }>;
  riskSummary: { overdueCount: number; highRiskCount: number; stagnantCount: number };
  overdueOrders: Array<ReportPreviewOrder>;
  highRiskOrders: Array<ReportPreviewOrder>;
  costSummary: { totalCost: string; scanCount: number };
}

export interface ReportPreviewOrder {
  orderNo: string;
  styleName: string;
  factoryName: string;
  quantity: number;
  progress: number;
  plannedEndDate: string | null;
}
