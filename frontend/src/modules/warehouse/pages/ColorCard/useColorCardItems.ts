import { useRef, useState } from 'react';
import { message as antdMessage } from 'antd';
import api from '@/utils/api';
import type { ColorCard, ColorCardItem, ApiResult, ColorCardDetail } from './types';
import { computeNextColorNo, incrementColorNo } from './utils';

interface UseColorCardItemsOptions {
  onSaved?: () => void;
}

export function useColorCardItems(options: UseColorCardItemsOptions = {}) {
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<ColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');
  const nextColorNoRef = useRef<string>('');

  const openItemsDialog = async (card: ColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.colorCardName);
    try {
      const res = await api.get<ApiResult<ColorCardDetail>>(`/color-card/${card.id}`);
      if (res.code === 200) {
        const items = res.data?.items || [];
        setCurrentItems(items);
        nextColorNoRef.current = computeNextColorNo(items);
      } else {
        setCurrentItems([]);
        nextColorNoRef.current = 'C001';
      }
    } catch {
      setCurrentItems([]);
      nextColorNoRef.current = 'C001';
    }
    setItemVisible(true);
  };

  const addEmptyItem = async () => {
    if (!nextColorNoRef.current) {
      try {
        const res = await api.get<{ code: number; data: string }>(
          `/color-card/${currentCardId}/generate-color-no`,
        );
        if (res.code === 200) nextColorNoRef.current = res.data;
      } catch {
        nextColorNoRef.current = 'C' + String(currentItems.length + 1).padStart(3, '0');
      }
    }
    const next: ColorCardItem = {
      colorNo: nextColorNoRef.current,
      colorName: '',
      unitPrice: undefined,
      image: '',
      remark: '',
      sortOrder: currentItems.length,
    };
    setCurrentItems([...currentItems, next]);
    nextColorNoRef.current = incrementColorNo(nextColorNoRef.current);
  };

  const updateItem = (idx: number, field: keyof ColorCardItem, value: string | number | undefined | null) => {
    const next = [...currentItems];
    next[idx] = { ...next[idx], [field]: value ?? undefined };
    setCurrentItems(next);
  };

  const removeItem = (idx: number) => {
    const next = [...currentItems];
    next.splice(idx, 1);
    setCurrentItems(next);
  };

  const saveItems = async () => {
    if (!currentCardId) return;
    const validItems = currentItems.filter(it => it.colorNo || it.colorName);
    if (validItems.length === 0) {
      antdMessage.warning('至少填写一条颜色');
      return;
    }
    try {
      await api.post(`/color-card/${currentCardId}/items/batch`, { items: validItems });
      antdMessage.success(`已保存 ${validItems.length} 条颜色`);
      setItemVisible(false);
      options.onSaved?.();
    } catch (err: any) {
      antdMessage.error(err?.message || '保存失败');
    }
  };

  return {
    itemVisible,
    setItemVisible,
    currentItems,
    setCurrentItems,
    currentCardId,
    setCurrentCardId,
    currentCardName,
    setCurrentCardName,
    nextColorNoRef,
    openItemsDialog,
    addEmptyItem,
    updateItem,
    removeItem,
    saveItems,
  };
}
