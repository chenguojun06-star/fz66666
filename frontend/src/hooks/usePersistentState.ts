import { Dispatch, SetStateAction, useEffect, useState } from 'react';

const STATE_KEY_PREFIX = 'state:';

function buildStorageKey(storageKey: string) {
  try {
    return `${STATE_KEY_PREFIX}${window.location.pathname}:${storageKey}`;
  } catch {
    return `${STATE_KEY_PREFIX}/${storageKey}`;
  }
}

function readState<T>(storageKey: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue;
  try {
    const raw = window.localStorage.getItem(buildStorageKey(storageKey));
    if (!raw) return initialValue;
    return JSON.parse(raw) as T;
  } catch {
    return initialValue;
  }
}

export function usePersistentState<T>(
  storageKey: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => readState(storageKey, initialValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(buildStorageKey(storageKey), JSON.stringify(state));
    } catch {
      return;
    }
  }, [state, storageKey]);

  return [state, setState];
}
