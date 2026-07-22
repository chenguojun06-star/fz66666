import { useCallback, useRef, useState } from 'react';
import { App } from 'antd';
import { toNumberSafe, sortSizeNames } from '@/utils/api';
import { StyleProcessRow, FALLBACK_SIZES } from './utils';

export function useProcessEditor() {
  const { message } = App.useApp();
  const [data, setData] = useState<StyleProcessRow[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [sizes, setSizes] = useState<string[]>([...FALLBACK_SIZES]);
  const [newSizeName, setNewSizeName] = useState('');
  const [addSizePopoverOpen, setAddSizePopoverOpen] = useState(false);
  const snapshotRef = useRef<StyleProcessRow[] | null>(null);

  const resetEditingState = useCallback(() => {
    setEditMode(false);
    snapshotRef.current = null;
  }, []);

  const enterEdit = useCallback(() => {
    if (editMode) return;
    snapshotRef.current = JSON.parse(JSON.stringify(data));
    setEditMode(true);
  }, [editMode, data]);

  const exitEdit = useCallback(() => {
    if (snapshotRef.current) {
      setData(snapshotRef.current);
    }
    resetEditingState();
  }, [resetEditingState]);

  const handleAdd = useCallback(() => {
    if (!editMode) enterEdit();
    const maxSort = data.length ? Math.max(...data.map((item) => toNumberSafe(item.sortOrder))) : 0;
    const nextSort = maxSort + 1;
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((size) => {
      sizePrices[size] = 0;
      sizePriceTouched[size] = false;
    });
    setData((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        processCode: String(nextSort).padStart(2, '0'),
        processName: '',
        progressStage: '车缝',
        machineType: '',
        difficulty: '',
        standardTime: 0,
        price: 0,
        sortOrder: nextSort,
        sizePrices,
        sizePriceTouched,
      },
    ]);
  }, [editMode, enterEdit, data, sizes]);

  const handleDelete = useCallback((id: string | number) => {
    if (!editMode) enterEdit();
    setData((prev) => prev
      .filter((item) => item.id !== id)
      .map((item, index) => ({
        ...item,
        sortOrder: index + 1,
        processCode: String(index + 1).padStart(2, '0'),
      }))
    );
  }, [editMode, enterEdit]);

  const updateField = useCallback((id: string | number, field: keyof StyleProcessRow, value: any) => {
    setData((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field !== 'price') {
        return { ...row, [field]: value };
      }
      const nextPrice = toNumberSafe(value);
      const oldPrice = toNumberSafe(row.price);
      const nextSizePrices = { ...(row.sizePrices || {}) };
      const touched = row.sizePriceTouched || {};
      sizes.forEach((size) => {
        const current = toNumberSafe(nextSizePrices[size]);
        if (!touched[size] || current === oldPrice) {
          nextSizePrices[size] = nextPrice;
        }
      });
      return { ...row, price: nextPrice, sizePrices: nextSizePrices };
    }));
  }, [sizes]);

  const updateSizePrice = useCallback((id: string | number, size: string, value: number) => {
    setData((prev) => prev.map((row) => row.id !== id ? row : {
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [size]: value },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [size]: true },
    }));
  }, []);

  const handleAddSize = useCallback(() => {
    const trimmed = newSizeName.trim().toUpperCase();
    if (!trimmed) {
      message.warning('请输入尺码');
      return;
    }
    if (sizes.includes(trimmed)) {
      message.warning('该尺码已存在');
      return;
    }
    setSizes((prev) => sortSizeNames([...prev, trimmed]));
    setData((prev) => prev.map((row) => ({
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [trimmed]: toNumberSafe(row.price) },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [trimmed]: false },
    })));
    setNewSizeName('');
    message.success(`已添加尺码: ${trimmed}`);
  }, [newSizeName, sizes, message]);

  const handleRemoveSize = useCallback((size: string) => {
    setSizes((prev) => prev.filter((item) => item !== size));
    setData((prev) => prev.map((row) => {
      const { [size]: _removedPrice, ...nextSizePrices } = row.sizePrices || {};
      const { [size]: _removedTouched, ...nextTouched } = row.sizePriceTouched || {};
      return { ...row, sizePrices: nextSizePrices, sizePriceTouched: nextTouched };
    }));
  }, []);

  return {
    data,
    setData,
    editMode,
    sizes,
    setSizes,
    newSizeName,
    setNewSizeName,
    addSizePopoverOpen,
    setAddSizePopoverOpen,
    resetEditingState,
    enterEdit,
    exitEdit,
    handleAdd,
    handleDelete,
    updateField,
    updateSizePrice,
    handleAddSize,
    handleRemoveSize,
  };
}
