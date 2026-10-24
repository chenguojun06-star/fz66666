import type { Message } from './types';

/** 生成简短唯一 sessionId */
export function genSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── 对话消息持久化（D-861）──
// 此前只存 sessionId 不存消息：关闭/刷新后 messages 回到 INITIAL_MSG，
// 用户看到「问完就没了、没有历史」。消息按 sessionId 存，最多保留 40 条、7 天过期。
const MESSAGES_LS_KEY = 'ai_chat_messages_v1';
const MESSAGES_MAX = 40;

interface StoredMessages {
  sessionId: string;
  savedAt: number;
  messages: Message[];
}

export function saveMessages(sessionId: string, messages: Message[]): void {
  try {
    const slim = messages.filter((m) => m && typeof m.text === 'string').slice(-MESSAGES_MAX);
    if (!slim.length) return;
    const payload: StoredMessages = { sessionId, savedAt: Date.now(), messages: slim };
    localStorage.setItem(MESSAGES_LS_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage 不可用或超出配额，忽略 */
  }
}

export function loadMessages(sessionId: string, fallback: Message[]): Message[] {
  try {
    const raw = localStorage.getItem(MESSAGES_LS_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as StoredMessages;
    if (!stored || stored.sessionId !== sessionId) return fallback;
    if ((Date.now() - stored.savedAt) / 86400000 >= SESSION_MAX_DAYS) return fallback;
    return Array.isArray(stored.messages) && stored.messages.length ? stored.messages : fallback;
  } catch {
    return fallback;
  }
}

// ── 聊天会话 localStorage 持久化（7天过期）──
export const SESSION_LS_KEY = 'ai_chat_session_v1';
export const SESSION_MAX_DAYS = 7;

export function saveSession(sessionId: string): void {
  try { localStorage.setItem(SESSION_LS_KEY, JSON.stringify({ sessionId, createdAt: Date.now() })); } catch { /* localStorage 不可用，忽略 */ }
}

export function loadSession(): string {
  try {
    const raw = localStorage.getItem(SESSION_LS_KEY);
    if (raw) {
      const { sessionId, createdAt } = JSON.parse(raw) as { sessionId: string; createdAt: number };
      const ageDays = (Date.now() - createdAt) / 86400000;
      if (ageDays < SESSION_MAX_DAYS && sessionId) return sessionId;
    }
  } catch { /* localStorage 不可用或JSON损坏，忽略 */ }
  const newId = genSessionId();
  saveSession(newId);
  return newId;
}

// ── 预警条目每日关闭 localStorage 方案 ──────────────────────────────────────────
const _aiPendingDismissKey = () => `ai_dismissed_pending_${new Date().toISOString().slice(0, 10)}`;

export const loadDismissedPending = (): Set<string> => {
  try {
    const raw = localStorage.getItem(_aiPendingDismissKey());
    if (!raw) return new Set<string>();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? new Set<string>(arr as string[]) : new Set<string>();
  } catch { return new Set<string>(); }
};

export const saveDismissedPending = (set: Set<string>) => {
  try { localStorage.setItem(_aiPendingDismissKey(), JSON.stringify([...set])); } catch { /* localStorage 不可用，忽略 */ }
};
