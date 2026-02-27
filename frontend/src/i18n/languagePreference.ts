export type AppLanguage = 'zh-CN' | 'en-US' | 'vi-VN' | 'km-KH';

export const APP_LANGUAGE_STORAGE_KEY = 'app.language';
export const APP_LANGUAGE_EVENT = 'app-language-change';
export const DEFAULT_APP_LANGUAGE: AppLanguage = 'zh-CN';

export const APP_LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string; shortLabel: string }> = [
  { value: 'zh-CN', label: '中文', shortLabel: '中文' },
  { value: 'en-US', label: 'English', shortLabel: 'EN' },
  { value: 'vi-VN', label: 'Tiếng Việt', shortLabel: 'VI' },
  { value: 'km-KH', label: 'ខ្មែរ', shortLabel: 'KM' },
];

export function normalizeAppLanguage(value: unknown): AppLanguage {
  const raw = String(value || '').trim() as AppLanguage;
  return APP_LANGUAGE_OPTIONS.some((item) => item.value === raw) ? raw : DEFAULT_APP_LANGUAGE;
}

export function getStoredAppLanguage(): AppLanguage {
  if (typeof window === 'undefined') return DEFAULT_APP_LANGUAGE;
  try {
    return normalizeAppLanguage(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

export function setStoredAppLanguage(language: AppLanguage): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeAppLanguage(language);
  try {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalized);
    window.dispatchEvent(new CustomEvent(APP_LANGUAGE_EVENT, { detail: { language: normalized } }));
  } catch {
    // ignore
  }
}
