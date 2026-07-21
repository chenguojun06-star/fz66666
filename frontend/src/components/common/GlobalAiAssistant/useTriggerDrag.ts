/**
 * useTriggerDrag — 小云浮标拖拽事件处理
 *
 * 处理浮标 mousedown → mousemove → mouseup 全流程：
 * - 移动超过 5px 判定为拖拽，实时 moveTo
 * - 松手后若为拖拽则 snapToEdge 吸附边缘
 * - 松手后若为点击则切换面板开关（关闭时 startIdleSnap，打开时 snapToVisible）
 */
import { useRef, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface TriggerPos {
  x: number;
  y: number;
  edge: 'left' | 'right';
}

interface UseTriggerDragParams {
  triggerPos: TriggerPos;
  cancelIdleSnap: () => void;
  setIsActiveDrag: Dispatch<SetStateAction<boolean>>;
  moveTo: (x: number, y: number) => void;
  snapToEdge: () => void;
  startIdleSnap: () => void;
  snapToVisible: () => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export function useTriggerDrag({
  triggerPos,
  cancelIdleSnap,
  setIsActiveDrag,
  moveTo,
  snapToEdge,
  startIdleSnap,
  snapToVisible,
  setIsOpen,
}: UseTriggerDragParams) {
  const hasDragRef = useRef(false);
  const dragStartRef = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });

  const handleTriggerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    hasDragRef.current = false;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, tx: triggerPos.x, ty: triggerPos.y };
    cancelIdleSnap();
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartRef.current.mx;
      const dy = ev.clientY - dragStartRef.current.my;
      if (!hasDragRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasDragRef.current = true;
        setIsActiveDrag(true);
      }
      if (!hasDragRef.current) return;
      moveTo(
        Math.max(-28, Math.min(dragStartRef.current.tx + dx, window.innerWidth - 28)),
        Math.max(10, Math.min(dragStartRef.current.ty + dy, window.innerHeight - 56)),
      );
    };
    const onUp = () => {
      setIsActiveDrag(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (hasDragRef.current) {
        snapToEdge();
      } else {
        // 点击（非拖拽）→ 切换面板
        setIsOpen(prev => {
          if (prev) { startIdleSnap(); } else { snapToVisible(); }
          return !prev;
        });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [triggerPos.x, triggerPos.y, cancelIdleSnap, setIsActiveDrag, moveTo, snapToEdge, startIdleSnap, snapToVisible, setIsOpen]);

  return { handleTriggerMouseDown, hasDragRef, dragStartRef };
}
