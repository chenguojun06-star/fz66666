export type SmartFeatureKey =
  | 'smart.guide.enabled'
  | 'smart.dict.autocollect.enabled'
  | 'smart.production.precheck.enabled'
  | 'smart.finance.explain.enabled'
  | 'smart.system.guard.enabled';

const defaultFlags: Record<SmartFeatureKey, boolean> = {
  'smart.guide.enabled': false,
  'smart.dict.autocollect.enabled': false,
  'smart.production.precheck.enabled': false,
  'smart.finance.explain.enabled': false,
  'smart.system.guard.enabled': false,
};

const storageKey = 'smart-feature-flags';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readStored = (): Partial<Record<SmartFeatureKey, boolean>> => {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Record<SmartFeatureKey, boolean>> = {};
    (Object.keys(defaultFlags) as SmartFeatureKey[]).forEach((key) => {
      if (typeof parsed[key] === 'boolean') {
        next[key] = parsed[key] as boolean;
      }
    });
    return next;
  } catch {
    return {};
  }
};

export const getSmartFeatureFlags = (): Record<SmartFeatureKey, boolean> => ({
  ...defaultFlags,
  ...readStored(),
});

export const isSmartFeatureEnabled = (key: SmartFeatureKey): boolean => {
  const flags = getSmartFeatureFlags();
  return Boolean(flags[key]);
};

export const setSmartFeatureFlag = (key: SmartFeatureKey, enabled: boolean): Record<SmartFeatureKey, boolean> => {
  const current = getSmartFeatureFlags();
  const next = { ...current, [key]: enabled };
  if (isBrowser) {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }
  return next;
};

export const resetSmartFeatureFlags = (): Record<SmartFeatureKey, boolean> => {
  if (isBrowser) {
    window.localStorage.removeItem(storageKey);
  }
  return { ...defaultFlags };
};
