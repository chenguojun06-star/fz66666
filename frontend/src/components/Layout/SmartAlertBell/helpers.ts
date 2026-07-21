import type { UrgentEvent } from './types';

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
