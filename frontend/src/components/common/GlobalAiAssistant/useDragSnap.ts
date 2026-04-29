/**
 * useDragSnap — 小云浮标拖拽 + 边缘吸附 + 空闲自动收纳 Hook
 *
 * 行为：
 * 1. 拖动浮标到任意位置，松手后自动吸附到最近的屏幕边缘（部分隐藏）
 * 2. 点击浮标打开面板时，浮标自动弹出到完全可见位置
 * 3. 关闭面板 3 秒后，浮标自动收纳回边缘（部分隐藏）
 * 4. 位置持久化到 localStorage，刷新页面保持位置
 *
 * 参考实现：miniprogram/components/ai-assistant/index.js（触摸拖拽版）
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'xiaoyun_trigger_pos';
const TRIGGER_SIZE = 56;
const DOCK_OFFSET = -28;   // 吸附时超出屏幕的距离（负值 = 部分隐藏）
const IDLE_TIMEOUT = 3000; // 空闲 3 秒后自动收纳

interface TriggerPos {
  x: number;
  y: number;
  edge: 'left' | 'right';
}

function loadSavedPos(): TriggerPos {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch { /* ignore */ }
  return {
    x: (typeof window !== 'undefined' ? window.innerWidth : 1200) - TRIGGER_SIZE - 32,
    y: (typeof window !== 'undefined' ? window.innerHeight : 800) - TRIGGER_SIZE - 32,
    edge: 'right',
  };
}

export function useDragSnap() {
  const [triggerPos, setTriggerPos] = useState<TriggerPos>(loadSavedPos);
  const [isDocked, setIsDocked] = useState(false);
  const [isActiveDrag, setIsActiveDrag] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((pos: TriggerPos) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* */ }
  }, []);

  const cancelIdleSnap = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
  }, []);

  const startIdleSnap = useCallback(() => {
    cancelIdleSnap();
    idleTimerRef.current = setTimeout(() => {
      setTriggerPos(prev => {
        const snapX = prev.edge === 'left' ? DOCK_OFFSET : window.innerWidth - TRIGGER_SIZE - DOCK_OFFSET;
        const pos = { ...prev, x: snapX };
        save(pos);
        return pos;
      });
      setIsDocked(true);
      idleTimerRef.current = null;
    }, IDLE_TIMEOUT);
  }, [cancelIdleSnap, save]);

  const snapToVisible = useCallback(() => {
    cancelIdleSnap();
    setTriggerPos(prev => {
      const snapX = prev.edge === 'left' ? 0 : window.innerWidth - TRIGGER_SIZE;
      const pos = { ...prev, x: snapX };
      save(pos);
      return pos;
    });
    setIsDocked(false);
  }, [cancelIdleSnap, save]);

  const moveTo = useCallback((x: number, y: number) => {
    setTriggerPos(prev => ({ ...prev, x, y }));
    setIsDocked(false);
  }, []);

  const snapToEdge = useCallback(() => {
    setTriggerPos(prev => {
      const midX = prev.x + TRIGGER_SIZE / 2;
      const edge: 'left' | 'right' = midX < window.innerWidth / 2 ? 'left' : 'right';
      const snapX = edge === 'left' ? DOCK_OFFSET : window.innerWidth - TRIGGER_SIZE - DOCK_OFFSET;
      const pos = { x: snapX, y: prev.y, edge };
      save(pos);
      return pos;
    });
    setIsDocked(true);
  }, [save]);

  // 窗口缩放时重新计算位置
  useEffect(() => {
    const h = () => setTriggerPos(prev => ({
      ...prev,
      x: prev.edge === 'right' ? window.innerWidth - TRIGGER_SIZE - DOCK_OFFSET : prev.x,
      y: Math.min(prev.y, window.innerHeight - TRIGGER_SIZE),
    }));
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => () => cancelIdleSnap(), [cancelIdleSnap]);

  // 初始化时自动收纳
  useEffect(() => { startIdleSnap(); }, [startIdleSnap]);

  return {
    triggerPos, isDocked, isActiveDrag, setIsActiveDrag,
    moveTo, snapToEdge, snapToVisible,
    startIdleSnap, cancelIdleSnap,
  };
}
