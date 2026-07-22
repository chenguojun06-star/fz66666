import { useState } from 'react';
import { message as antdMessage } from 'antd';
import api from '@/utils/api';
import type { ColorCard, ColorCardItem, ApiResult, ColorCardDetail } from './types';

interface UseColorCardPreviewOptions {
  onGenerated?: () => void;
}

export function useColorCardPreview(options: UseColorCardPreviewOptions = {}) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCard, setPreviewCard] = useState<ColorCard | null>(null);
  const [previewItems, setPreviewItems] = useState<ColorCardItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  const openPreview = async (card: ColorCard) => {
    setPreviewCard(card);
    try {
      const res = await api.get<ApiResult<ColorCardDetail>>(`/color-card/${card.id}`);
      if (res.code === 200) {
        const items = res.data?.items || [];
        setPreviewItems(items);
        setSelectedItems(new Set(items.map((_, i) => i)));
      } else {
        setPreviewItems([]);
      }
    } catch {
      setPreviewItems([]);
    }
    setPreviewVisible(true);
  };

  const confirmGenerate = async () => {
    if (!previewCard || selectedItems.size === 0) {
      antdMessage.warning('请选择要生成的颜色');
      return;
    }
    try {
      const itemsToGenerate = selectedItems.size === previewItems.length
        ? null
        : previewItems.filter((_, i) => selectedItems.has(i));
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/color-card/${previewCard.id}/generate-materials`, { items: itemsToGenerate },
      );
      if (res.code === 200) {
        antdMessage.success(`成功生成 ${res.data.length} 条物料记录`);
        setPreviewVisible(false);
        options.onGenerated?.();
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '生成失败');
    }
  };

  const toggleSelect = (idx: number) => {
    const next = new Set(selectedItems);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedItems(next);
  };

  return {
    previewVisible,
    setPreviewVisible,
    previewCard,
    previewItems,
    selectedItems,
    setSelectedItems,
    openPreview,
    confirmGenerate,
    toggleSelect,
  };
}
