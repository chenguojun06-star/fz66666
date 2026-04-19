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
  let match: RegExpExecArray | null;

  const chartRe = /【CHART】([\s\S]*?)【\/CHART】/g;
  while ((match = chartRe.exec(rawText)) !== null) {
    try { charts.push(JSON.parse(match[1].trim())); } catch {}
  }

  const actionsRe = /【ACTIONS】([\s\S]*?)【\/ACTIONS】/g;
  while ((match = actionsRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (Array.isArray(parsed)) actionCards.push(...parsed);
    } catch {}
  }

  const actionsJsonRe = /```ACTIONS_JSON\s*\n([\s\S]*?)\n```/g;
  while ((match = actionsJsonRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (Array.isArray(parsed)) quickActions.push(...parsed);
    } catch {}
  }

  const teamStatusRe = /【TEAM_STATUS】([\s\S]*?)【\/TEAM_STATUS】/g;
  while ((match = teamStatusRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (Array.isArray(parsed)) teamStatusCards.push(...parsed);
    } catch {}
  }

  const bundleSplitRe = /【BUNDLE_SPLIT】([\s\S]*?)【\/BUNDLE_SPLIT】/g;
  while ((match = bundleSplitRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (Array.isArray(parsed)) bundleSplitCards.push(...parsed);
    } catch {}
  }

  const insightCardsRe = /【INSIGHT_CARDS】([\s\S]*?)【\/INSIGHT_CARDS】/g;
  while ((match = insightCardsRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (Array.isArray(parsed)) cards.push(...(parsed as XiaoyunInsightCardData[]));
    } catch {}
  }

  const stepWizardRe = /【STEP_WIZARD】([\s\S]*?)【\/STEP_WIZARD】/g;
  while ((match = stepWizardRe.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (Array.isArray(parsed)) stepWizardCards.push(...parsed);
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
  };
};
