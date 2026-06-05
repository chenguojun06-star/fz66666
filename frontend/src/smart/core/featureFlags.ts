import { isSmartFeatureEnabledFromStore, refreshIfNeeded } from './smartFeatureStore';

export type SmartFeatureKey =
  | 'smart.guide.enabled'
  | 'smart.dict.autocollect.enabled'
  | 'smart.production.precheck.enabled'
  | 'smart.finance.explain.enabled'
  | 'smart.system.guard.enabled'
  | 'smart.worker-profile.enabled'
  | 'smart.warehousing.audit.enabled'
  | 'smart.material.inventory.ai.enabled'
  | 'smart.material.purchase.ai.enabled'
  | 'print.hangtag.defaultTemplateId'
  | 'print.barcode.defaultTemplateId'
  | 'print.washLabel.defaultTemplateId'
  | 'print.codeType'
  | 'outstock.allowPriceAdjust'
  | 'outstock.priceAdjustRequireReason';

export type MiniprogramMenuKey =
  | 'miniprogram.menu.smartOps'
  | 'miniprogram.menu.dashboard'
  | 'miniprogram.menu.orderCreate'
  | 'miniprogram.menu.production'
  | 'miniprogram.menu.quality'
  | 'miniprogram.menu.bundleSplit'
  | 'miniprogram.menu.cuttingDetail'
  | 'miniprogram.menu.history'
  | 'miniprogram.menu.factoryShipment'
  | 'miniprogram.menu.advance'
  | 'miniprogram.menu.wagePayment';

export type SmartFeatureFlags = Record<SmartFeatureKey, boolean>;
export type MiniprogramMenuFlags = Record<MiniprogramMenuKey, boolean>;

export const MINIPROGRAM_MENU_KEYS: MiniprogramMenuKey[] = [
  'miniprogram.menu.smartOps',
  'miniprogram.menu.dashboard',
  'miniprogram.menu.orderCreate',
  'miniprogram.menu.production',
  'miniprogram.menu.quality',
  'miniprogram.menu.bundleSplit',
  'miniprogram.menu.cuttingDetail',
  'miniprogram.menu.history',
  'miniprogram.menu.factoryShipment',
  'miniprogram.menu.advance',
  'miniprogram.menu.wagePayment',
];

const defaultFlags: SmartFeatureFlags = {
  'smart.guide.enabled': false,
  'smart.dict.autocollect.enabled': false,
  'smart.production.precheck.enabled': false,
  'smart.finance.explain.enabled': false,
  'smart.system.guard.enabled': false,
  'smart.worker-profile.enabled': false,
  'smart.warehousing.audit.enabled': false,
  'smart.material.inventory.ai.enabled': false,
  'smart.material.purchase.ai.enabled': false,
  'print.hangtag.defaultTemplateId': false,
  'print.barcode.defaultTemplateId': false,
  'print.washLabel.defaultTemplateId': false,
  'print.codeType': false,
  'outstock.allowPriceAdjust': false,
  'outstock.priceAdjustRequireReason': false,
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

export const replaceSmartFeatureFlags = (
  nextFlags: Partial<Record<SmartFeatureKey, boolean>>,
): SmartFeatureFlags => {
  const next: SmartFeatureFlags = {
    ...defaultFlags,
    ...nextFlags,
  };
  if (isBrowser) {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }
  return next;
};

export const isSmartFeatureEnabled = (key: SmartFeatureKey): boolean => {
  try {
    return isSmartFeatureEnabledFromStore(key);
  } catch {
    const flags = getSmartFeatureFlags();
    return Boolean(flags[key]);
  }
};

export const triggerSmartFeatureRefresh = (): void => {
  refreshIfNeeded().catch(() => {});
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

export const getDefaultSmartFeatureFlags = (): SmartFeatureFlags => ({
  ...defaultFlags,
});

const miniprogramMenuDefaultFlags: MiniprogramMenuFlags = {
  'miniprogram.menu.smartOps': true,
  'miniprogram.menu.dashboard': true,
  'miniprogram.menu.orderCreate': true,
  'miniprogram.menu.production': true,
  'miniprogram.menu.quality': true,
  'miniprogram.menu.bundleSplit': true,
  'miniprogram.menu.cuttingDetail': true,
  'miniprogram.menu.history': true,
  'miniprogram.menu.factoryShipment': true,
  'miniprogram.menu.advance': true,
  'miniprogram.menu.wagePayment': true,
};

const miniprogramMenuStorageKey = 'miniprogram-menu-flags';

const readStoredMiniprogramMenu = (): Partial<Record<MiniprogramMenuKey, boolean>> => {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(miniprogramMenuStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Record<MiniprogramMenuKey, boolean>> = {};
    (Object.keys(miniprogramMenuDefaultFlags) as MiniprogramMenuKey[]).forEach((key) => {
      if (typeof parsed[key] === 'boolean') {
        next[key] = parsed[key] as boolean;
      }
    });
    return next;
  } catch {
    return {};
  }
};

export const getMiniprogramMenuFlags = (): MiniprogramMenuFlags => ({
  ...miniprogramMenuDefaultFlags,
  ...readStoredMiniprogramMenu(),
});

export const replaceMiniprogramMenuFlags = (
  nextFlags: Partial<Record<MiniprogramMenuKey, boolean>>,
): MiniprogramMenuFlags => {
  const next: MiniprogramMenuFlags = {
    ...miniprogramMenuDefaultFlags,
    ...nextFlags,
  };
  if (isBrowser) {
    window.localStorage.setItem(miniprogramMenuStorageKey, JSON.stringify(next));
  }
  return next;
};

export const resetMiniprogramMenuFlags = (): MiniprogramMenuFlags => {
  if (isBrowser) {
    window.localStorage.removeItem(miniprogramMenuStorageKey);
  }
  return { ...miniprogramMenuDefaultFlags };
};
