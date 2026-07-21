import { useState, useCallback, useEffect } from 'react';

export type PanelSize = 'small' | 'medium' | 'large';

const SIZE_DIMENSIONS: Record<PanelSize, { width: number; height: number }> = {
  small: { width: 640, height: 820 },
  medium: { width: 960, height: 820 },
  large: { width: 1280, height: 820 },
};

const SIZE_ORDER: PanelSize[] = ['small', 'medium', 'large'];
const STORAGE_KEY = 'xiaoyun.panel.size';

function loadSavedSize(): PanelSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && SIZE_ORDER.includes(raw as PanelSize)) return raw as PanelSize;
  } catch { /* localStorage 不可用，忽略 */ }
  return 'small';
}

export function usePanelResize() {
  const [size, setSize] = useState<PanelSize>(loadSavedSize);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, size); } catch { /* localStorage 不可用，忽略 */ }
  }, [size]);

  const cycleSize = useCallback(() => {
    setSize(prev => {
      const idx = SIZE_ORDER.indexOf(prev);
      return SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
    });
  }, []);

  const dimensions = SIZE_DIMENSIONS[size];
  const showSidebar = size !== 'small';
  const showAuxPanel = size === 'large';

  return { size, cycleSize, dimensions, showSidebar, showAuxPanel };
}