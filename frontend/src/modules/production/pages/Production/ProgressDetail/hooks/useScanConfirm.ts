import { useCallback, useEffect, useRef, useState } from 'react';

type ScanConfirmState = {
  visible: boolean;
  remain: number;
  loading: boolean;
  payload: any | null;
  detail: any | null;
  meta: any | null;
};

type UseScanConfirmOptions = {
  durationMs?: number;
  tickMs?: number;
};

export const useScanConfirm = (options: UseScanConfirmOptions = {}) => {
  const durationMs = options.durationMs ?? 15000;
  const tickMs = options.tickMs ?? 500;
  const [state, setState] = useState<ScanConfirmState>({
    visible: false,
    remain: 0,
    loading: false,
    payload: null,
    detail: null,
    meta: null,
  });

  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearTimers();
  }, [clearTimers]);

  const closeConfirm = useCallback(() => {
    clearTimers();
    setState((prev) => ({
      ...prev,
      visible: false,
      remain: 0,
      loading: false,
      payload: null,
      detail: null,
      meta: null,
    }));
  }, [clearTimers]);

  const openConfirm = useCallback((payload: any, detail: any, meta: any) => {
    clearTimers();
    setState((prev) => ({
      ...prev,
      visible: true,
      remain: Math.ceil(durationMs / 1000),
      payload: payload || null,
      detail: detail || null,
      meta: meta || null,
      loading: false,
    }));
    const expireAt = Date.now() + durationMs;
    timerRef.current = window.setTimeout(() => {
      closeConfirm();
    }, durationMs);
    tickRef.current = window.setInterval(() => {
      const remain = Math.max(0, Math.ceil((expireAt - Date.now()) / 1000));
      setState((prev) => (prev.remain === remain ? prev : { ...prev, remain }));
    }, tickMs);
  }, [clearTimers, closeConfirm, durationMs, tickMs]);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  return {
    state,
    openConfirm,
    closeConfirm,
    setLoading,
  };
};
