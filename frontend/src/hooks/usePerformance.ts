import { useEffect, useState } from 'react';

/**
 * 防抖值 Hook
 * @param value 原始值
 * @param wait 等待时间(ms)
 */
export function useDebouncedValue<T>(value: T, wait: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, wait]);

  return debouncedValue;
}
