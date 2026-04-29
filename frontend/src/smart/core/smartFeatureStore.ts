import { create } from 'zustand';
import tenantSmartFeatureService from '@/services/system/tenantSmartFeatureService';
import {
  type SmartFeatureKey,
  type SmartFeatureFlags,
  replaceSmartFeatureFlags,
  resetSmartFeatureFlags,
} from '@/smart/core/featureFlags';

const DEFAULT_FLAGS: SmartFeatureFlags = {
  'smart.guide.enabled': false,
  'smart.dict.autocollect.enabled': false,
  'smart.production.precheck.enabled': false,
  'smart.finance.explain.enabled': false,
  'smart.system.guard.enabled': false,
  'smart.worker-profile.enabled': false,
  'smart.warehousing.audit.enabled': false,
  'smart.material.inventory.ai.enabled': false,
  'smart.material.purchase.ai.enabled': false,
};

interface SmartFeatureState {
  flags: SmartFeatureFlags;
  loaded: boolean;
  loading: boolean;
  lastFetchedAt: number | null;
  fetchFromServer: () => Promise<SmartFeatureFlags>;
  updateFlag: (key: SmartFeatureKey, enabled: boolean) => void;
  replaceAll: (next: Partial<Record<SmartFeatureKey, boolean>>) => SmartFeatureFlags;
  resetAll: () => SmartFeatureFlags;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const readLocalStorageCache = (): SmartFeatureFlags => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('smart-feature-flags') : null;
    if (!raw) return { ...DEFAULT_FLAGS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...DEFAULT_FLAGS };
    (Object.keys(DEFAULT_FLAGS) as SmartFeatureKey[]).forEach((key) => {
      if (typeof parsed[key] === 'boolean') {
        result[key] = parsed[key] as boolean;
      }
    });
    return result;
  } catch {
    return { ...DEFAULT_FLAGS };
  }
};

export const useSmartFeatureStore = create<SmartFeatureState>((set, get) => ({
  flags: readLocalStorageCache(),
  loaded: false,
  loading: false,
  lastFetchedAt: null,

  fetchFromServer: async () => {
    const state = get();
    if (state.loading) return state.flags;

    set({ loading: true });
    try {
      const serverFlags = await tenantSmartFeatureService.list();
      const merged: SmartFeatureFlags = {
        ...DEFAULT_FLAGS,
        ...serverFlags,
      };
      replaceSmartFeatureFlags(merged);
      set({ flags: merged, loaded: true, loading: false, lastFetchedAt: Date.now() });
      return merged;
    } catch {
      set({ loading: false, loaded: true });
      return get().flags;
    }
  },

  updateFlag: (key, enabled) => {
    const current = get().flags;
    const next = { ...current, [key]: enabled };
    replaceSmartFeatureFlags(next);
    set({ flags: next });
  },

  replaceAll: (nextFlags) => {
    const merged: SmartFeatureFlags = {
      ...DEFAULT_FLAGS,
      ...nextFlags,
    };
    replaceSmartFeatureFlags(merged);
    set({ flags: merged });
    return merged;
  },

  resetAll: () => {
    const defaults = resetSmartFeatureFlags();
    set({ flags: defaults });
    return defaults;
  },
}));

export const refreshIfNeeded = async (): Promise<void> => {
  const state = useSmartFeatureStore.getState();
  if (!state.loaded || (state.lastFetchedAt && Date.now() - state.lastFetchedAt > REFRESH_INTERVAL_MS)) {
    await state.fetchFromServer();
  }
};

export const isSmartFeatureEnabledFromStore = (key: SmartFeatureKey): boolean => {
  return Boolean(useSmartFeatureStore.getState().flags[key]);
};
