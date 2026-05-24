import { useCallback, useMemo, useState } from 'react';

export const useModal = <T = any>() => {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((record?: T) => {
    setData(record || null);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setData(null), 300);
  }, []);

  const setModalData = useCallback((newData: T | null) => {
    setData(newData);
  }, []);

  return useMemo(() => ({
    visible,
    data,
    open,
    close,
    setModalData,
  }), [visible, data, open, close, setModalData]);
};
