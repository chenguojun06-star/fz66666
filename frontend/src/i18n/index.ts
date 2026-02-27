import { LOCALES } from './locales.generated';
import { type AppLanguage, getStoredAppLanguage } from './languagePreference';

type LocaleTree = Record<string, unknown>;

const DEFAULT_LANG: AppLanguage = 'zh-CN';

function getByPath(obj: LocaleTree | undefined, keyPath: string): unknown {
  if (!obj || !keyPath) return undefined;
  return keyPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function t(keyPath: string, language?: AppLanguage): string {
  const currentLanguage = language && LOCALES[language] ? language : getStoredAppLanguage();
  const current = LOCALES[currentLanguage] as LocaleTree;
  const fallback = LOCALES[DEFAULT_LANG] as LocaleTree;
  const value = getByPath(current, keyPath);
  if (value !== undefined && value !== null) return String(value);
  const fallbackValue = getByPath(fallback, keyPath);
  return fallbackValue !== undefined && fallbackValue !== null ? String(fallbackValue) : keyPath;
}

export function tf(keyPath: string, params: Record<string, string | number>, language?: AppLanguage): string {
  let result = t(keyPath, language);
  Object.keys(params).forEach((key) => {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(params[key]));
  });
  return result;
}
