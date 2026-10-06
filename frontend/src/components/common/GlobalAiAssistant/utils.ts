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
  // 首次创建时打时间戳（AI 消息统一在此处补齐，避免每个调用点重复写）
  const created = build(undefined);
  return [...messages, { ...created, timestamp: created.timestamp ?? Date.now() }];
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
  /**
   * D-702：合并保护。
   *
   * 消息合并用的是 `{ ...existing, ...data }`。若 data 里存在
   * `cards: undefined` 这个键，仍会把已收到的卡片**覆盖成空**（JS 展开语义：
   * 键存在且值为 undefined 时结果就是 undefined）。因此「保留旧值」不能靠
   * 传 undefined，必须让这些键**根本不出现**在 data 里。
   */
  preserve?: { keepExistingCards?: boolean; keepExistingFollowUpActions?: boolean },
) {
  const { intent, cardsOverride, commandId, followUpActions, reportTypeToDownload } = opts;
  const cards = cardsOverride && cardsOverride.length ? cardsOverride : parsed.cards;
  const data = {
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
  // 新内容没带卡片/建议时，删掉这些键，让合并保留消息上已有的值
  if (preserve?.keepExistingCards && !(cards && cards.length)) {
    delete (data as { cards?: unknown }).cards;
  }
  if (preserve?.keepExistingFollowUpActions && !(followUpActions && followUpActions.length)) {
    delete (data as { followUpActions?: unknown }).followUpActions;
  }
  return data;
}
