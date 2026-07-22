import type { Message, FollowUpAction } from './types';
import { parseAiResponse } from './types';

export function upsertMessage(
  messages: Message[],
  id: string,
  build: (existing: Message | undefined) => Message,
): Message[] {
  const existing = messages.find((m) => m.id === id);
  if (existing) {
    return messages.map((m) => (m.id === id ? build(existing) : m));
  }
  return [...messages, build(undefined)];
}

type ParsedAnswer = ReturnType<typeof parseAiResponse>;

export interface BuildMessageDataOptions {
  intent?: string;
  cardsOverride?: any[];
  commandId?: string;
  followUpActions?: FollowUpAction[];
  reportTypeToDownload?: 'daily' | 'weekly' | 'monthly';
}

export function buildMessageData(
  displayText: string,
  parsed: ParsedAnswer,
  opts: BuildMessageDataOptions = {},
) {
  const { intent, cardsOverride, commandId, followUpActions, reportTypeToDownload } = opts;
  const cards = cardsOverride && cardsOverride.length ? cardsOverride : parsed.cards;
  return {
    text: displayText,
    intent,
    reportType: reportTypeToDownload || parsed.reportType,
    reportPreview: parsed.reportPreview,
    charts: parsed.charts,
    cards,
    actionCards: parsed.actionCards,
    quickActions: parsed.quickActions,
    teamStatusCards: parsed.teamStatusCards,
    bundleSplitCards: parsed.bundleSplitCards,
    stepWizardCards: parsed.stepWizardCards,
    overdueFactoryCard: parsed.overdueFactoryCard,
    agentCommandId: commandId,
    followUpActions,
  };
}
