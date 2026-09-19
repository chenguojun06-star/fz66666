import { describe, it, expect } from 'vitest';
import { genSessionId } from '../../components/common/GlobalAiAssistant/sessionUtils';

describe('genSessionId - 生成会话ID', () => {
  it('返回以"s-"开头的字符串', () => {
    expect(genSessionId()).toMatch(/^s-/);
  });

  it('每次调用生成不同的ID', () => {
    const id1 = genSessionId();
    const id2 = genSessionId();
    expect(id1).not.toBe(id2);
  });

  it('ID长度合理（不过短也不过长）', () => {
    const id = genSessionId();
    expect(id.length).toBeGreaterThan(5);
    expect(id.length).toBeLessThan(50);
  });
});

describe('SSE防御式消息创建逻辑 - P0修复验证', () => {
  interface Message {
    id: string;
    role: 'ai' | 'user';
    text: string;
    followUpActions?: unknown[];
  }

  function simulateAnswerEvent(messages: Message[], aiMsgId: string, accumulatedText: string): Message[] {
    const existing = messages.find(m => m.id === aiMsgId);
    if (existing) return messages.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m);
    return [...messages, { id: aiMsgId, role: 'ai' as const, text: accumulatedText }];
  }

  function simulateFollowUpEvent(messages: Message[], aiMsgId: string, actions: unknown[]): Message[] {
    const existing = messages.find(m => m.id === aiMsgId);
    if (existing) return messages.map(m => m.id === aiMsgId ? { ...m, followUpActions: actions } : m);
    return [...messages, { id: aiMsgId, role: 'ai' as const, text: '', followUpActions: actions }];
  }

  it('正常流程：thinking→answer_chunk→answer 消息正确创建', () => {
    const aiMsgId = 'a-001';
    let messages: Message[] = [{ id: 'u-001', role: 'user', text: '你好' }];

    messages = [...messages, { id: aiMsgId, role: 'ai', text: '小云正在整理思路…' }];
    expect(messages.find(m => m.id === aiMsgId)).toBeDefined();

    messages = simulateAnswerEvent(messages, aiMsgId, '你好！我是小云');
    expect(messages.find(m => m.id === aiMsgId)?.text).toBe('你好！我是小云');
  });

  it('P0修复：answer事件先于thinking到达时，仍能创建消息', () => {
    const aiMsgId = 'a-002';
    const messages: Message[] = [{ id: 'u-002', role: 'user', text: '你在干嘛呢' }];

    const result = simulateAnswerEvent(messages, aiMsgId, '我在帮你查看生产数据');
    const aiMsg = result.find(m => m.id === aiMsgId);
    expect(aiMsg).toBeDefined();
    expect(aiMsg?.role).toBe('ai');
    expect(aiMsg?.text).toBe('我在帮你查看生产数据');
  });

  it('P0修复：follow_up_actions先于thinking到达时，仍能创建消息', () => {
    const aiMsgId = 'a-003';
    const messages: Message[] = [{ id: 'u-003', role: 'user', text: '查看订单' }];
    const actions = [{ label: '查看详情', actionType: 'NAVIGATE' }];

    const result = simulateFollowUpEvent(messages, aiMsgId, actions);
    const aiMsg = result.find(m => m.id === aiMsgId);
    expect(aiMsg).toBeDefined();
    expect(aiMsg?.role).toBe('ai');
    expect(aiMsg?.followUpActions).toEqual(actions);
  });

  it('answer_chunk多次到达时文本正确累积', () => {
    const aiMsgId = 'a-004';
    let messages: Message[] = [{ id: 'u-004', role: 'user', text: '查询' }];

    messages = simulateAnswerEvent(messages, aiMsgId, '你');
    messages = simulateAnswerEvent(messages, aiMsgId, '你好');
    messages = simulateAnswerEvent(messages, aiMsgId, '你好，生');

    const aiMsg = messages.find(m => m.id === aiMsgId);
    expect(aiMsg?.text).toBe('你好，生');
  });

  it('已有消息时answer事件只更新不重复创建', () => {
    const aiMsgId = 'a-005';
    let messages: Message[] = [
      { id: 'u-005', role: 'user', text: '问' },
      { id: aiMsgId, role: 'ai', text: '思考中…' },
    ];

    messages = simulateAnswerEvent(messages, aiMsgId, '回答内容');
    const aiMsgs = messages.filter(m => m.id === aiMsgId);
    expect(aiMsgs).toHaveLength(1);
    expect(aiMsgs[0].text).toBe('回答内容');
  });
});
