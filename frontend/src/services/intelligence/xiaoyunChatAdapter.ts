import type { XiaoyunInsightCardData } from '@/components/common/XiaoyunInsightCard';

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

  const displayText = rawText
    .replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '')
    .replace(/【CHART】[\s\S]*?【\/CHART】/g, '')
    .replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '')
    .replace(/【TEAM_STATUS】[\s\S]*?【\/TEAM_STATUS】/g, '')
    .replace(/【BUNDLE_SPLIT】[\s\S]*?【\/BUNDLE_SPLIT】/g, '')
    .replace(/【INSIGHT_CARDS】[\s\S]*?【\/INSIGHT_CARDS】/g, '')
    .replace(/【STEP_WIZARD】[\s\S]*?【\/STEP_WIZARD】/g, '')
    .replace(/【CLARIFICATION】[\s\S]*?【\/CLARIFICATION】/g, '')
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
  };
};
