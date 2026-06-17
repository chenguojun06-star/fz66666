import { useCallback, useEffect, useRef } from 'react';

/**
 * 扫码声音反馈Hook
 *
 * 提供成功/失败提示音，提升车间工人扫码体验
 *
 * 使用方式：
 *   const { playSuccess, playError } = useScanSound();
 *
 *   // 扫码成功后
 *   playSuccess();
 *
 *   // 扫码失败后
 *   playError();
 */
export const useScanSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);

  const scheduleTimer = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {
          // 忽略关闭错误
        }
        audioContextRef.current = null;
      }
    };
  }, [clearAllTimers]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('AudioContext不支持:', e);
        return null;
      }
    }
    return audioContextRef.current;
  }, []);

  /**
   * 播放成功提示音
   * 频率：800Hz → 1200Hz，音调上升，听起来愉悦
   * 时长：100ms
   */
  const playSuccess = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      // 如果AudioContext被暂停，需要resume
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // 设置频率：800Hz → 1200Hz（上升音调表示成功）
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

      // 设置音量：0.3（不太响，不影响工作）
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      // 播放
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // 静默失败，不影响主流程
      console.debug('播放成功音效失败:', e);
    }
  }, [getAudioContext]);

  /**
   * 播放失败提示音
   * 频率：400Hz → 200Hz，音调下降，听起来警示
   * 时长：200ms
   */
  const playError = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // 设置频率：400Hz → 200Hz（下降音调表示失败）
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);

      // 设置音量：0.4（稍微响一点，引起注意）
      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      // 播放
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.debug('播放失败音效失败:', e);
    }
  }, [getAudioContext]);

  /**
   * 播放重复扫码提示音
   * 短促的蜂鸣声，提醒用户已扫码
   */
  const playDuplicate = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // 设置频率：600Hz（平稳音调）
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);

      // 设置音量：0.2（轻柔提醒）
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      // 播放两次（短促蜂鸣）
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);

      scheduleTimer(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(600, ctx.currentTime);
        gain2.gain.setValueAtTime(0.2, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.1);
      }, 120);
    } catch (e) {
      console.debug('播放重复音效失败:', e);
    }
  }, [getAudioContext, scheduleTimer]);

  /**
   * 播放警告提示音
   * 用于数量超出等特殊情况
   */
  const playWarning = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // 播放三声警告
      for (let i = 0; i < 3; i++) {
        scheduleTimer(() => {
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(800, ctx.currentTime);
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.08);
        }, i * 150);
      }
    } catch (e) {
      console.debug('播放警告音效失败:', e);
    }
  }, [getAudioContext, scheduleTimer]);

  return {
    playSuccess,
    playError,
    playDuplicate,
    playWarning,
  };
};
