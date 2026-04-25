import type { XiaoyunInsightCardData } from '@/components/common/XiaoyunInsightCard';
import type { OverdueFactoryCardData } from '@/components/common/GlobalAiAssistant/OverdueFactoryCardWidget';
import type { ReportPreviewData } from '@/components/common/GlobalAiAssistant/types';

export interface XiaoyunChatPayload {
  answer?: string;
  displayAnswer?: string;
  suggestions?: string[];
  cards?: XiaoyunInsightCardData[];
  commandId?: string;
  source?: string;
}

export interface ParsedXiaoyunLegacyMeta {
  displayText: string;
  cards: XiaoyunInsightCardData[];
  charts: unknown[];
  actionCards: unknown[];
  quickActions: unknown[];
  teamStatusCards: unknown[];
  bundleSplitCards: unknown[];
  stepWizardCards: unknown[];
  clarificationHints?: string[];
  overdueFactoryCard?: OverdueFactoryCardData;
  reportPreview?: ReportPreviewData;
  reportType?: 'daily' | 'weekly' | 'monthly';
}

function safeParseJson(raw: string, _label: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];
    return [];
  } catch {
    return [];
  }
}

function validateInsightCard(item: unknown): XiaoyunInsightCardData | null {
  if (!item || typeof item !== 'object') return null;
  const card = item as Record<string, unknown>;
  if (typeof card.title !== 'string' || !card.title) return null;
  return item as XiaoyunInsightCardData;
}

function validateActionCard(item: unknown): unknown | null {
  if (!item || typeof item !== 'object') return null;
  const card = item as Record<string, unknown>;
  if (typeof card.title !== 'string' || !card.title) return null;
  return item;
}

export const normalizeXiaoyunChatPayload = (raw: any): XiaoyunChatPayload | null => {
  const payload = raw?.data ?? raw ?? null;
  if (!payload || !payload.answer) {
    return null;
  }
  return {
    answer: payload.answer,
    displayAnswer: payload.displayAnswer || payload.answer,
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
    cards: Array.isArray(payload.cards) ? payload.cards : [],
    commandId: payload.commandId ? String(payload.commandId) : undefined,
    source: payload.source,
  };
};

export const parseXiaoyunLegacyMeta = (rawText: string): ParsedXiaoyunLegacyMeta => {
  const charts: unknown[] = [];
  const cards: XiaoyunInsightCardData[] = [];
  const actionCards: unknown[] = [];
  const quickActions: unknown[] = [];
  const teamStatusCards: unknown[] = [];
  const bundleSplitCards: unknown[] = [];
  const stepWizardCards: unknown[] = [];
  let clarificationHints: string[] | undefined;
  let match: RegExpExecArray | null;

  const chartRe = /【CHART】([\s\S]*?)【\/CHART】/g;
  while ((match = chartRe.exec(rawText)) !== null) {
    charts.push(...safeParseJson(match[1].trim(), 'chart'));
  }

  const actionsRe = /【ACTIONS】([\s\S]*?)【\/ACTIONS】/g;
  while ((match = actionsRe.exec(rawText)) !== null) {
    const parsed = safeParseJson(match[1].trim(), 'actions');
    parsed.forEach(item => { const v = validateActionCard(item); if (v) actionCards.push(v); });
  }

  const actionsJsonRe = /```ACTIONS_JSON\s*\n([\s\S]*?)\n```/g;
  while ((match = actionsJsonRe.exec(rawText)) !== null) {
    quickActions.push(...safeParseJson(match[1].trim(), 'actionsJson'));
  }

  const teamStatusRe = /【TEAM_STATUS】([\s\S]*?)【\/TEAM_STATUS】/g;
  while ((match = teamStatusRe.exec(rawText)) !== null) {
    teamStatusCards.push(...safeParseJson(match[1].trim(), 'teamStatus'));
  }

  const bundleSplitRe = /【BUNDLE_SPLIT】([\s\S]*?)【\/BUNDLE_SPLIT】/g;
  while ((match = bundleSplitRe.exec(rawText)) !== null) {
    bundleSplitCards.push(...safeParseJson(match[1].trim(), 'bundleSplit'));
  }

  const insightCardsRe = /【INSIGHT_CARDS】([\s\S]*?)【\/INSIGHT_CARDS】/g;
  while ((match = insightCardsRe.exec(rawText)) !== null) {
    const parsed = safeParseJson(match[1].trim(), 'insightCards');
    parsed.forEach(item => { const v = validateInsightCard(item); if (v) cards.push(v); });
  }

  const stepWizardRe = /【STEP_WIZARD】([\s\S]*?)【\/STEP_WIZARD】/g;
  while ((match = stepWizardRe.exec(rawText)) !== null) {
    stepWizardCards.push(...safeParseJson(match[1].trim(), 'stepWizard'));
  }

  const clarificationRe = /【CLARIFICATION】([\s\S]*?)【\/CLARIFICATION】/g;
  while ((match = clarificationRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) clarificationHints = parsed.map(String);
    } catch {}
  }

  let overdueFactoryCard: OverdueFactoryCardData | undefined;
  const overdueFactoryRe = /【OVERDUE_FACTORY】([\s\S]*?)【\/OVERDUE_FACTORY】/g;
  while ((match = overdueFactoryRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed === 'object') {
        const factoryGroups = Array.isArray(parsed) ? parsed : [parsed];
        const first = factoryGroups[0] as Record<string, unknown> | undefined;
        if (first && typeof first === 'object' && 'factoryName' in first) {
          overdueFactoryCard = {
            overdueCount: factoryGroups.reduce((s: number, g: Record<string, unknown>) => s + ((g.totalOrders as number) || 0), 0),
            totalQuantity: factoryGroups.reduce((s: number, g: Record<string, unknown>) => s + ((g.totalQuantity as number) || 0), 0),
            avgProgress: factoryGroups.length > 0
              ? Math.round(factoryGroups.reduce((s: number, g: Record<string, unknown>) => s + ((g.avgProgress as number) || 0), 0) / factoryGroups.length)
              : 0,
            avgOverdueDays: factoryGroups.length > 0
              ? Math.round(factoryGroups.reduce((s: number, g: Record<string, unknown>) => s + ((g.avgOverdueDays as number) || 0), 0) / factoryGroups.length)
              : 0,
            factoryGroupCount: factoryGroups.length,
            factoryGroups: factoryGroups as OverdueFactoryCardData['factoryGroups'],
          };
        } else if ('overdueCount' in (parsed as Record<string, unknown>)) {
          overdueFactoryCard = parsed as unknown as OverdueFactoryCardData;
        }
      }
    } catch {}
  }

  let reportPreview: ReportPreviewData | undefined;
  let reportType: 'daily' | 'weekly' | 'monthly' | undefined;
  const reportPreviewRe = /【REPORT_PREVIEW】([\s\S]*?)【\/REPORT_PREVIEW】/g;
  while ((match = reportPreviewRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed === 'object' && 'kpis' in parsed) {
        reportPreview = parsed as ReportPreviewData;
        reportType = (parsed.reportType as 'daily' | 'weekly' | 'monthly') || 'daily';
      }
    } catch {}
  }

  const displayText = rawText
    .replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '')
    .replace(/【CHART】[\s\S]*?【\/CHART】/g, '')
    .replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '')
    .replace(/【TEAM_STATUS】[\s\S]*?【\/TEAM_STATUS】/g, '')
    .replace(/【BUNDLE_SPLIT】[\s\S]*?【\/BUNDLE_SPLIT】/g, '')
    .replace(/【INSIGHT_CARDS】[\s\S]*?【\/INSIGHT_CARDS】/g, '')
    .replace(/【STEP_WIZARD】[\s\S]*?【\/STEP_WIZARD】/g, '')
    .replace(/【CLARIFICATION】[\s\S]*?【\/CLARIFICATION】/g, '')
    .replace(/【OVERDUE_FACTORY】[\s\S]*?【\/OVERDUE_FACTORY】/g, '')
    .replace(/【REPORT_PREVIEW】[\s\S]*?【\/REPORT_PREVIEW】/g, '')
    .trim();

  return {
    displayText,
    cards,
    charts,
    actionCards,
    quickActions,
    teamStatusCards,
    bundleSplitCards,
    stepWizardCards,
    clarificationHints,
    overdueFactoryCard,
    reportPreview,
    reportType,
  };
};
