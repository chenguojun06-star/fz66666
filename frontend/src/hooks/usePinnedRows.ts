import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserPreference } from './useUserPreference';
import { useUser } from '@/utils/AuthContext';

/**
 * 列表行置顶 Hook（生产订单 / 样衣开发等列表共用）。
 *
 * 置顶 = 一组有序的业务记录 id，展示时排 在列表最前（用户自己的视角，不影响其他人）。
 * 持久化双写：
 *  - localStorage（按用户隔离，即时生效、离线可用）
 *  - t_user_preference 偏好云（换浏览器/换设备登录后仍跟人走）
 * 云端拉到的值覆盖本地（以云端为准），保存失败静默降级为纯本地。
 */

const MAX_PINS = 10;

const localKeyOf = (pageKey: string, userKey: string) => `page.pinnedRows.${pageKey}.${userKey || 'anon'}`;

function readLocalPins(pageKey: string, userKey: string): string[] {
  try {
    const raw = localStorage.getItem(localKeyOf(pageKey, userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x)).filter(Boolean).slice(0, MAX_PINS);
  } catch {
    return [];
  }
}

function writeLocalPins(pageKey: string, userKey: string, pins: string[]) {
  try {
    localStorage.setItem(localKeyOf(pageKey, userKey), JSON.stringify(pins));
  } catch {
    // intentionally empty
  }
}

export function usePinnedRows(pageKey: string) {
  const { user } = useUser();
  const userKey = String((user as any)?.id || '').trim();
  const { listByPage, save } = useUserPreference();

  const [pins, setPins] = useState<string[]>([]);

  // 初始：先读本地（按用户隔离），再拉云端覆盖（换设备登录后仍跟人走）
  useEffect(() => {
    if (!userKey) return;
    setPins(readLocalPins(pageKey, userKey));
    let cancelled = false;
    void (async () => {
      const items = await listByPage(pageKey);
      if (cancelled) return;
      const pref = items.find((it) => it.preferenceType === 'pinnedRows');
      if (pref?.preferenceValue) {
        try {
          const parsed = JSON.parse(pref.preferenceValue);
          if (Array.isArray(parsed) && parsed.length) {
            const cloud = parsed.map((x: unknown) => String(x)).filter(Boolean).slice(0, MAX_PINS);
            setPins(cloud);
            writeLocalPins(pageKey, userKey, cloud);
          }
        } catch { /* 云端值损坏时保持本地 */ }
      }
    })();
    return () => { cancelled = true; };
  }, [pageKey, userKey, listByPage]);

  const persist = useCallback((next: string[]) => {
    if (!userKey) return;
    writeLocalPins(pageKey, userKey, next);
    void save({ pageKey, preferenceType: 'pinnedRows', preferenceValue: next });
  }, [pageKey, userKey, save]);

  const toggle = useCallback((id: string | number | undefined | null) => {
    const key = String(id ?? '').trim();
    if (!key) return;
    setPins((prev) => {
      const next = prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [key, ...prev].slice(0, MAX_PINS);
      persist(next);
      return next;
    });
  }, [persist]);

  const isPinned = useCallback((id: string | number | undefined | null) => {
    const key = String(id ?? '').trim();
    return Boolean(key) && pins.includes(key);
  }, [pins]);

  const pinSet = useMemo(() => new Set(pins), [pins]);

  return { pins, pinSet, isPinned, toggle, maxPins: MAX_PINS };
}
