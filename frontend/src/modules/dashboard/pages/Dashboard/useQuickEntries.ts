import { useState } from 'react';
import { App } from 'antd';
import { ALL_QUICK_ENTRIES, QuickEntryConfig, STORAGE_KEY } from './quickEntryConfig';

export const useQuickEntries = () => {
  const { message } = App.useApp();

  const [quickEntries, setQuickEntries] = useState<QuickEntryConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const savedConfig = JSON.parse(saved);
        return ALL_QUICK_ENTRIES.map(entry => ({
          ...entry,
          enabled: savedConfig[entry.id] !== false,
        }));
      } catch (e) {
        console.error('Failed to parse quick entries config:', e);
      }
    }
    return ALL_QUICK_ENTRIES;
  });

  const saveQuickEntriesConfig = (entries: QuickEntryConfig[]) => {
    const config: Record<string, boolean> = {};
    entries.forEach(entry => {
      config[entry.id] = entry.enabled;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  };

  const handleToggleEntry = (entryId: string) => {
    const updated = quickEntries.map(entry =>
      entry.id === entryId ? { ...entry, enabled: !entry.enabled } : entry
    );
    setQuickEntries(updated);
  };

  const handleSaveSettings = (onClose: () => void) => {
    saveQuickEntriesConfig(quickEntries);
    onClose();
    message.success('快捷入口设置已保存');
  };

  const handleResetSettings = () => {
    const resetEntries = ALL_QUICK_ENTRIES.map(entry => ({ ...entry, enabled: true }));
    setQuickEntries(resetEntries);
    saveQuickEntriesConfig(resetEntries);
    message.success('已重置为默认设置');
  };

  return {
    quickEntries,
    handleToggleEntry,
    handleSaveSettings,
    handleResetSettings,
  };
};
