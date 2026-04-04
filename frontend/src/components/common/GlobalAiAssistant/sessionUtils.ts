/** 生成简短唯一 sessionId */
export function genSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── 聊天会话 localStorage 持久化（7天过期）──
export const SESSION_LS_KEY = 'ai_chat_session_v1';
export const SESSION_MAX_DAYS = 7;

export function saveSession(sessionId: string): void {
  try { localStorage.setItem(SESSION_LS_KEY, JSON.stringify({ sessionId, createdAt: Date.now() })); } catch {}
}

export function loadSession(): string {
  try {
    const raw = localStorage.getItem(SESSION_LS_KEY);
    if (raw) {
      const { sessionId, createdAt } = JSON.parse(raw) as { sessionId: string; createdAt: number };
      const ageDays = (Date.now() - createdAt) / 86400000;
      if (ageDays < SESSION_MAX_DAYS && sessionId) return sessionId;
    }
  } catch {}
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
  try { localStorage.setItem(_aiPendingDismissKey(), JSON.stringify([...set])); } catch {}
};
