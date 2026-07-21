import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleInfo } from '@/types/style';
import { StyleViewMode } from './useStyleViewMode';

interface UseStyleFocusParams {
  viewMode: StyleViewMode;
  data: StyleInfo[];
}

/**
 * 款式焦点滚动 Hook
 * 管理焦点样式 ID、滚动定位、定时清理
 */
export const useStyleFocus = ({ viewMode, data }: UseStyleFocusParams) => {
  const [pendingFocusStyleId, setPendingFocusStyleId] = useState<string | null>(null);
  const [focusedStyleId, setFocusedStyleId] = useState<string | null>(null);
  const focusClearTimerRef = useRef<number | null>(null);

  const getStyleDomKey = useCallback((record: Partial<StyleInfo> | null | undefined) => {
    return String(record?.id || record?.styleNo || '').trim();
  }, []);

  const scrollToFocusedStyle = useCallback((styleId: string) => {
    const safeId = styleId.replace(/"/g, '\\"');
    const selector = viewMode === 'smart'
      ? `#style-smart-row-${safeId}`
      : `#style-card-${safeId}`;
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedStyleId(styleId);
    if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    focusClearTimerRef.current = window.setTimeout(() => setFocusedStyleId(null), 2200);
    return true;
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingFocusStyleId) return;
    const timer = window.setTimeout(() => {
      if (scrollToFocusedStyle(pendingFocusStyleId)) {
        setPendingFocusStyleId(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pendingFocusStyleId, scrollToFocusedStyle, viewMode, data]);

  return {
    pendingFocusStyleId,
    setPendingFocusStyleId,
    focusedStyleId,
    setFocusedStyleId,
    getStyleDomKey,
    scrollToFocusedStyle,
  };
};
