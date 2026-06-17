import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const useModal = <T = any>() => {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const open = useCallback((record?: T) => {
    clearPendingTimer();
    setData(record || null);
    setVisible(true);
  }, [clearPendingTimer]);

  const close = useCallback(() => {
    clearPendingTimer();
    setVisible(false);
    setData(null);
  }, [clearPendingTimer]);

  const setModalData = useCallback((newData: T | null) => {
    setData(newData);
  }, []);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  return useMemo(() => ({
    visible,
    data,
    open,
    close,
    setModalData,
  }), [visible, data, open, close, setModalData]);
};
