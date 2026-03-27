import { useCallback, useEffect, useState } from 'react';

type SortDirection = 'asc' | 'desc' | 'ascend' | 'descend';

interface UsePersistentSortOptions<TField extends string, TOrder extends SortDirection> {
  storageKey: string;
  defaultField: TField;
  defaultOrder: TOrder;
}

type StoredSortState = {
  field?: string;
  order?: string;
};

const SORT_KEY_PREFIX = 'sort:';

const buildStorageKey = (storageKey: string) => {
  try {
    return `${SORT_KEY_PREFIX}${window.location.pathname}:${storageKey}`;
  } catch {
    return `${SORT_KEY_PREFIX}/${storageKey}`;
  }
};

function readPersistentSort<TField extends string, TOrder extends SortDirection>(
  storageKey: string,
  defaultField: TField,
  defaultOrder: TOrder,
) {
  if (typeof window === 'undefined') {
    return { field: defaultField, order: defaultOrder };
  }
  try {
    const raw = window.localStorage.getItem(buildStorageKey(storageKey));
    if (!raw) {
      return { field: defaultField, order: defaultOrder };
    }
    const parsed = JSON.parse(raw) as StoredSortState;
    const field = String(parsed?.field || '').trim();
    const order = String(parsed?.order || '').trim();
    return {
      field: (field || defaultField) as TField,
      order: (order || defaultOrder) as TOrder,
    };
  } catch {
    return { field: defaultField, order: defaultOrder };
  }
}

function savePersistentSort<TField extends string, TOrder extends SortDirection>(
  storageKey: string,
  field: TField,
  order: TOrder,
) {
  try {
    window.localStorage.setItem(
      buildStorageKey(storageKey),
      JSON.stringify({ field, order }),
    );
  } catch {
    return;
  }
}

export function usePersistentSort<TField extends string, TOrder extends SortDirection>({
  storageKey,
  defaultField,
  defaultOrder,
}: UsePersistentSortOptions<TField, TOrder>) {
  const [sortField, setSortField] = useState<TField>(
    () => readPersistentSort(storageKey, defaultField, defaultOrder).field,
  );
  const [sortOrder, setSortOrder] = useState<TOrder>(
    () => readPersistentSort(storageKey, defaultField, defaultOrder).order,
  );

  useEffect(() => {
    savePersistentSort(storageKey, sortField, sortOrder);
  }, [storageKey, sortField, sortOrder]);

  const handleSort = useCallback((field: TField, order: TOrder) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  return {
    sortField,
    sortOrder,
    setSortField,
    setSortOrder,
    handleSort,
  };
}
