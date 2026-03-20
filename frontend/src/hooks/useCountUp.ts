/**
 * useCountUp — 数字滚动动画 Hook
 *
 * 用途：仪表盘 Statistic / 统计卡片的数字从 0 滚动到目标值，
 *       给用户「数据在计算」的动感，而非瞬间跳变。
 *
 * 用法：
 *   const displayValue = useCountUp(totalOrders, { duration: 1000 });
 *   <Statistic value={displayValue} />
 *
 * 选项：
 *   duration  — 动画总时长 ms，默认 1200
 *   delay     — 延迟启动 ms，配合 stagger 错位，默认 0
 *   decimals  — 小数位数，默认 0（整数）
 *   enabled   — 是否启用，false 时直接返回 target（SSR / 测试用），默认 true
 */

import { useEffect, useRef, useState } from 'react';

// easeOutQuart：先快后慢，最后稳定落点，适合计数器
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

export interface UseCountUpOptions {
  /** 动画持续时间（ms），默认 1200 */
  duration?: number;
  /** 延迟启动（ms），配合卡片 stagger 使用，默认 0 */
  delay?: number;
  /** 小数位数，默认 0 */
  decimals?: number;
  /** 是否启用动画，关闭时直接返回 target，默认 true */
  enabled?: boolean;
}

export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
  const {
    duration = 1200,
    delay    = 0,
    decimals = 0,
    enabled  = true,
  } = options;

  const [value, setValue] = useState<number>(enabled ? 0 : target);

  const rafRef     = useRef<number | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef   = useRef<number | null>(null);

  useEffect(() => {
    // 禁用或 target 为 0 时直接赋值
    if (!enabled || target === 0) {
      setValue(target);
      return;
    }

    // 重置，准备新一轮动画
    setValue(0);
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;

      const elapsed  = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = easeOutQuart(progress);
      const current  = parseFloat((eased * target).toFixed(decimals));

      setValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // 确保最终落在精确值
        setValue(target);
      }
    };

    if (delay > 0) {
      timerRef.current = setTimeout(() => {
        rafRef.current = requestAnimationFrame(animate);
      }, delay);
    } else {
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current)   cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [target, duration, delay, decimals, enabled]);

  return value;
}
