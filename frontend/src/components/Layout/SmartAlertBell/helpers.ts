import type { BriefData, UrgentEvent } from './types';

export const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

// 根据事件类型获取跳转路径
export const getEventNav = (ev: UrgentEvent): string => {
  if (ev.type === 'overdue')   return `/production?orderNo=${ev.orderNo}`;
  if (ev.type === 'defective') return `/production/warehousing?orderNo=${ev.orderNo}`;
  if (ev.type === 'approval')  return '/finance/center?tab=factory';
  if (ev.type === 'material')  return '/warehouse/material';
  return '/dashboard';
};

// ─── localStorage 每日 dismiss 辅助 ─────────────────────────
export const _sapDismissKey = () => `sap_dismissed_${new Date().toISOString().slice(0, 10)}`;
export const loadDismissed = (): Set<string> => {
  try {
    const raw = localStorage.getItem(_sapDismissKey());
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
};
export const saveDismissed = (ids: Set<string>) => {
  try { localStorage.setItem(_sapDismissKey(), JSON.stringify([...ids])); } catch { /* ok */ }
};

export const _sapNoticeDismissKey = () => `sap_dismissed_notices_${new Date().toISOString().slice(0, 10)}`;
export const loadDismissedNotices = (): Set<number> => {
  try {
    const raw = localStorage.getItem(_sapNoticeDismissKey());
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch { return new Set(); }
};
export const saveDismissedNotices = (ids: Set<number>) => {
  try { localStorage.setItem(_sapNoticeDismissKey(), JSON.stringify([...ids])); } catch { /* ok */ }
};

// ─── 主组件常量 ─────────────────────────────────────────────
export const NOTICE_POLL_INTERVAL = 60_000;
export const MAX_BACKOFF = 5 * 60_000;

// ─── 提醒建议 dismiss key（与 SmartAlertBell 渲染共用） ──────────
export const decisionCardKey = (card: { title?: string; summary?: string }) =>
  `decisionCard_${card.title || String(card.summary || '').slice(0, 48)}`;
export const suggestionKey = (s: string) => `suggestion_${String(s).slice(0, 64)}`;

/**
 * 提醒建议可见数（面板实际展示的条数，dismiss 后扣减）。
 *
 * <p>规则与 SmartAlertBell 的渲染完全一致：
 * 以 suggestions 非空为总闸；有 decisionCards 时展示前 3 张卡，
 * 否则展示前 3 条建议；每条命中 dismissedIds 即不可见。
 *
 * <p>用途：消息中心页签数必须和你看到的一致。原先页签用的是服务端
 * 原始未读数，与本地 dismiss 各算各的 —— 点了 × 数字不动，这是本次要修的 bug。
 */
export function countVisibleSuggestions(
  brief: BriefData | null | undefined,
  dismissedIds: Set<string>,
): number {
  if (!brief?.suggestions || brief.suggestions.length === 0) return 0;
  if (brief.decisionCards && brief.decisionCards.length > 0) {
    return brief.decisionCards.slice(0, 3).filter((c) => !dismissedIds.has(decisionCardKey(c))).length;
  }
  return brief.suggestions.slice(0, 3).filter((s) => !dismissedIds.has(suggestionKey(s))).length;
}
