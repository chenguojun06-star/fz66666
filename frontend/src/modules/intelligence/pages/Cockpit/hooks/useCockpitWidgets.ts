import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_POSITION,
  DEFAULT_WIDGETS,
  STORAGE_KEY,
  WidgetKey,
  WidgetState,
  loadWidgetState,
} from '../helpers';

interface DragRef {
  key: WidgetKey;
  startX: number;
  startY: number;
  startWidgetX: number;
  startWidgetY: number;
  startWidth: number;
  startHeight: number;
  mode: 'move' | 'resize';
}

export interface CockpitWidgetHandlers {
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleRemove: (key: WidgetKey) => void;
  handleRefresh: () => void;
  handleResetLayout: () => void;
  handleMouseDown: (key: WidgetKey, e: React.MouseEvent, mode: 'move' | 'resize') => void;
  handleTouchStart: (key: WidgetKey, e: React.TouchEvent, mode: 'move' | 'resize') => void;
}

export interface UseCockpitWidgetsResult extends CockpitWidgetHandlers {
  widgets: WidgetState;
  refreshKey: number;
  refreshing: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  hasPlacedWidgets: boolean;
}

/**
 * Cockpit 看板组件状态与交互逻辑 Hook：
 * - widgets 布局状态 + localStorage 持久化
 * - 拖拽/缩放交互系统（鼠标 + 触摸）
 * - 刷新与重置布局
 */
export const useCockpitWidgets = (): UseCockpitWidgetsResult => {
  const [widgets, setWidgets] = useState<WidgetState>(loadWidgetState);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragRef | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch (e) {
      console.warn('[Cockpit] localStorage 写入失败:', e);
    }
  }, [widgets]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const moduleKey = e.dataTransfer.getData('text/module-key') as WidgetKey;
    if (moduleKey && moduleKey in widgets && !widgets[moduleKey].placed) {
      const rect = containerRef.current?.getBoundingClientRect();
      const x = e.clientX - (rect?.left || 0) - 100;
      const y = e.clientY - (rect?.top || 0) - 100;
      setWidgets(prev => ({
        ...prev,
        [moduleKey]: {
          placed: true,
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: DEFAULT_POSITION.width,
          height: DEFAULT_POSITION.height,
        },
      }));
    }
  }, [widgets]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleRemove = useCallback((key: WidgetKey) => {
    setWidgets(prev => ({
      ...prev,
      [key]: { ...prev[key], placed: false },
    }));
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
  }, []);

  const handleResetLayout = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    setRefreshKey(k => k + 1);
  }, []);

  const handleMouseDown = useCallback((key: WidgetKey, e: React.MouseEvent, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const widget = widgets[key];
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      startWidgetX: widget.x,
      startWidgetY: widget.y,
      startWidth: widget.width,
      startHeight: widget.height,
      mode,
    };
  }, [widgets]);

  const handleTouchStart = useCallback((key: WidgetKey, e: React.TouchEvent, mode: 'move' | 'resize') => {
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    const widget = widgets[key];
    dragRef.current = {
      key,
      startX: touch.clientX,
      startY: touch.clientY,
      startWidgetX: widget.x,
      startWidgetY: widget.y,
      startWidth: widget.width,
      startHeight: widget.height,
      mode,
    };
  }, [widgets]);

  useEffect(() => {
    let rafId: number | null = null;
    let pendingDelta = { x: 0, y: 0 };

    const updatePosition = () => {
      if (!dragRef.current) return;
      const { key, startWidgetX, startWidgetY, startWidth, startHeight, mode } = dragRef.current;
      const deltaX = pendingDelta.x;
      const deltaY = pendingDelta.y;

      setWidgets(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          x: mode === 'move' ? Math.max(0, startWidgetX + deltaX) : prev[key].x,
          y: mode === 'move' ? Math.max(0, startWidgetY + deltaY) : prev[key].y,
          width: mode === 'resize' ? Math.max(300, startWidth + deltaX) : prev[key].width,
          height: mode === 'resize' ? Math.max(280, startHeight + deltaY) : prev[key].height,
        },
      }));
      rafId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      pendingDelta.x = e.clientX - dragRef.current.startX;
      pendingDelta.y = e.clientY - dragRef.current.startY;
      if (!rafId) {
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragRef.current || !e.touches[0]) return;
      e.preventDefault();
      pendingDelta.x = e.touches[0].clientX - dragRef.current.startX;
      pendingDelta.y = e.touches[0].clientY - dragRef.current.startY;
      if (!rafId) {
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    const handleMouseUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp, { passive: true });
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const hasPlacedWidgets = useMemo(() =>
    widgets.overview.placed
    || widgets.order.placed
    || widgets.sample.placed
    || widgets.production.placed
    || widgets.procurement.placed
    || widgets.warehouse.placed,
    [widgets]
  );

  return {
    widgets,
    refreshKey,
    refreshing,
    containerRef,
    hasPlacedWidgets,
    handleDrop,
    handleDragOver,
    handleRemove,
    handleRefresh,
    handleResetLayout,
    handleMouseDown,
    handleTouchStart,
  };
};
