import { useState } from 'react';

export type StyleViewMode = 'smart' | 'card';

const STYLE_VIEW_MODE_STORAGE_KEY = 'style_info_list_view_mode';
const LEGACY_STYLE_VIEW_MODE_KEY = 'viewMode_styleInfoList';

const readInitialStyleViewMode = (): StyleViewMode => {
  const saved = String(localStorage.getItem(STYLE_VIEW_MODE_STORAGE_KEY) || '').trim();
  if (saved === 'smart' || saved === 'card') {
    return saved;
  }

  // 兼容旧键：历史的 list 实际对应当前 smart 布局
  const legacy = String(localStorage.getItem(LEGACY_STYLE_VIEW_MODE_KEY) || '').trim();
  if (legacy === 'card') {
    return 'card';
  }
  if (legacy === 'list') {
    return 'smart';
  }

  return 'smart';
};

export const useStyleViewMode = () => {
  const [viewMode, setViewModeState] = useState<StyleViewMode>(() => readInitialStyleViewMode());

  const setViewMode = (mode: StyleViewMode) => {
    localStorage.setItem(STYLE_VIEW_MODE_STORAGE_KEY, mode);
    setViewModeState(mode);
  };

  return {
    viewMode,
    setViewMode,
  };
};
