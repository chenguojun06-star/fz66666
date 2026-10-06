import { describe, it, expect } from 'vitest';
import { buildMessageData, upsertMessage } from '../../components/common/GlobalAiAssistant/utils';

/**
 * D-702：后处理审查完成后会补发第二个 `answer` 事件（整段替换消息）。
 * 这里守护随之而来的两个坑。
 */
describe('buildMessageData 合并保护（D-702 补发 answer）', () => {
  const parsedEmpty = { cards: [] } as never;

  it('新内容没带卡片时，cards 键必须整个消失（否则覆盖已收到的卡片为空）', () => {
    const data = buildMessageData('审查后的文本', parsedEmpty, {}, { keepExistingCards: true });
    expect('cards' in data).toBe(false);
  });

  it('新内容带了卡片时，必须保留新卡片', () => {
    const cards = [{ type: 'anomaly_list' }] as never;
    const data = buildMessageData('t', { cards } as never, {}, { keepExistingCards: true });
    expect(data.cards).toEqual(cards);
  });

  it('followUpActions 同理：没带就消失，带了就生效', () => {
    const without = buildMessageData('t', parsedEmpty, {}, { keepExistingFollowUpActions: true });
    expect('followUpActions' in without).toBe(false);

    const actions = [{ label: '查订单' }] as never;
    const withActions = buildMessageData('t', parsedEmpty, { followUpActions: actions }, { keepExistingFollowUpActions: true });
    expect(withActions.followUpActions).toEqual(actions);
  });

  /**
   * 关键回归：`{ ...existing, ...data }` 中 `cards: undefined` 依然会覆盖。
   * 所以「保留旧值」只能靠删键，不能靠传 undefined——这条断言同时验证
   * upsertMessage 的合并语义与 buildMessageData 的删键配合是有效的。
   */
  it('端到端：补发空卡片不会把已有卡片与建议清空', () => {
    const first = buildMessageData('首版答案', { cards: [{ type: 'order' }] } as never, {
      followUpActions: [{ label: '继续' }] as never,
    });
    let messages = upsertMessage([], 'm1', () => ({ id: 'm1', role: 'ai', ...first }) as never);

    // 后处理补发：文本改进，但没带卡片/建议
    const refined = buildMessageData('审查改进后的答案', parsedEmpty, {}, {
      keepExistingCards: true,
      keepExistingFollowUpActions: true,
    });
    messages = upsertMessage(messages, 'm1', (existing) => ({ ...existing, ...refined }) as never);

    const merged = messages[0] as unknown as { text: string; cards?: unknown[]; followUpActions?: unknown[] };
    expect(merged.text).toBe('审查改进后的答案');
    expect(merged.cards).toEqual([{ type: 'order' }]);
    expect(merged.followUpActions).toEqual([{ label: '继续' }]);
  });

  it('未开启保护时保持原行为（首次回答仍要写入 cards 键）', () => {
    const data = buildMessageData('首版', parsedEmpty, {});
    expect('cards' in data).toBe(true);
  });
});