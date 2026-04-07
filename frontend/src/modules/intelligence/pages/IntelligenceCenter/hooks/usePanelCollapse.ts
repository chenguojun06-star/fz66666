import { useState, useCallback } from 'react';

export function usePanelCollapse(storageKey = 'cockpit_main_panel_collapsed') {
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  });

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedPanels(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { collapsedPanels, toggleCollapse };
}
