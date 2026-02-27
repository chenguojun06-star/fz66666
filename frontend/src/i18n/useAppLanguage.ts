import { useEffect, useState } from 'react';
import {
  APP_LANGUAGE_EVENT,
  type AppLanguage,
  getStoredAppLanguage,
  normalizeAppLanguage,
  setStoredAppLanguage,
} from './languagePreference';

export const useAppLanguage = () => {
  const [language, setLanguageState] = useState<AppLanguage>(() => getStoredAppLanguage());

  useEffect(() => {
    const syncFromStorage = () => setLanguageState(getStoredAppLanguage());
    const onLanguageEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ language?: AppLanguage }>;
      setLanguageState(normalizeAppLanguage(customEvent?.detail?.language));
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(APP_LANGUAGE_EVENT, onLanguageEvent);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(APP_LANGUAGE_EVENT, onLanguageEvent);
    };
  }, []);

  const setLanguage = (nextLanguage: AppLanguage) => {
    setStoredAppLanguage(nextLanguage);
    setLanguageState(normalizeAppLanguage(nextLanguage));
  };

  return { language, setLanguage };
};
