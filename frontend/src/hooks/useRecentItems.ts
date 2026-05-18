import { useState, useCallback } from 'react';

const STORAGE_KEY = 'user_recent_items';
const MAX_ITEMS = 10;

interface RecentItem {
  id: string;
  type: string;
  label: string;
  desc?: string;
  href?: string;
}

function loadItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems(items: RecentItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>(loadItems);

  const push = useCallback((item: RecentItem) => {
    setItems(prev => {
      const filtered = prev.filter(i => !(i.id === item.id && i.type === item.type));
      const next = [item, ...filtered];
      saveItems(next);
      return next;
    });
  }, []);

  const getByType = useCallback((type: string, count = 5) => {
    return items.filter(i => i.type === type).slice(0, count);
  }, [items]);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  return { items, push, getByType, clear };
}